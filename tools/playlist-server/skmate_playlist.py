#!/usr/bin/env python3
"""SkMate playlist service: the author's auto-updated playlist.

The author sends .m3u / .m3u8 files to a Telegram bot. The service merges them into one playlist,
checks every stream in the background and serves only the working ones at a single address that the
app subscribes to. Only the standard library is used.

Rules:
  - Channels with the same tvg-id (or, without one, the same normalised name) are one channel; every
    address they come with is kept as a fallback, newest file first.
  - An address is dropped only after FAIL_LIMIT failed checks in a row, each at least RETRY_GAP apart,
    so a short outage does not empty the list. A working fallback takes over meanwhile, in the same
    place and under the same number.
  - Dead addresses are still checked, less often, and come back by themselves when they work again.
  - The app is never involved: it only downloads the finished playlist.

Environment (see deploy notes in README.md next to this file):
  SKMATE_PL_DATA      data directory (files, state, output)          default ./data
  SKMATE_PL_PORT      port of the local HTTP server (behind nginx)   default 18110
  SKMATE_PL_TOKEN     Telegram bot token (bot off when empty)
  SKMATE_PL_ADMINS    Telegram user ids allowed to send files, comma separated
"""

from __future__ import annotations

import concurrent.futures
import hashlib
import http.server
import json
import os
import re
import socketserver
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

DATA = os.path.abspath(os.environ.get("SKMATE_PL_DATA", "data"))
PORT = int(os.environ.get("SKMATE_PL_PORT", "18110"))
TOKEN = os.environ.get("SKMATE_PL_TOKEN", "").strip()
ADMINS = {int(x) for x in os.environ.get("SKMATE_PL_ADMINS", "").replace(" ", "").split(",") if x}

FILES = os.path.join(DATA, "files")
STATE = os.path.join(DATA, "state.json")
OUT = os.path.join(DATA, "playlist.m3u8")

FAIL_LIMIT = 3                 # failed checks in a row before an address counts as dead
RETRY_GAP = 10 * 60            # seconds between checks of a failing address
ALIVE_EVERY = 6 * 3600         # a working address is checked again after this
DEAD_EVERY = 12 * 3600         # a dead address is tried again after this
WORKERS = 12                   # checks at once
TIMEOUT = 10                   # seconds per request
USER_AGENT = "SkMate-IPTV-check/1.0"
MAX_FILE_BYTES = 20 * 1024 * 1024

lock = threading.RLock()


# ---------------------------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------------------------

ATTR = re.compile(r'([\w-]+)="([^"]*)"')


@dataclass
class Entry:
    name: str
    url: str
    attrs: dict
    extras: list          # #EXTVLCOPT / #KODIPROP lines that belong to the stream
    group: str


def parse_m3u(text: str) -> list[Entry]:
    entries: list[Entry] = []
    info = None
    extras: list[str] = []
    group = ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#EXTINF"):
            head, _, name = line.partition(",")
            info = (dict(ATTR.findall(head)), name.strip())
            extras = []
            group = ""
        elif line.startswith("#EXTGRP:"):
            group = line[len("#EXTGRP:"):].strip()
        elif line.startswith("#EXTVLCOPT") or line.startswith("#KODIPROP"):
            extras.append(line)
        elif line.startswith("#"):
            continue
        elif info is not None:
            attrs, name = info
            g = attrs.get("group-title") or group
            entries.append(Entry(name=name or attrs.get("tvg-name", ""), url=line, attrs=attrs, extras=extras, group=g))
            info = None
            extras = []
            group = ""
    return entries


def channel_key(e: Entry) -> str:
    tvg = e.attrs.get("tvg-id", "").strip().lower()
    if tvg:
        return "id:" + tvg
    name = e.name.lower()
    name = re.sub(r"[\[\(].*?[\]\)]", " ", name)
    name = re.sub(r"\b(fhd|uhd|hd|sd|4k|orig|backup|резерв)\b", " ", name)
    name = re.sub(r"[^\w]+", " ", name, flags=re.UNICODE)
    return "name:" + " ".join(name.split())


# ---------------------------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------------------------

def load_state() -> dict:
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"urls": {}, "reports": {}}


def save_state(state: dict) -> None:
    tmp = STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False)
    os.replace(tmp, STATE)


def source_files() -> list[str]:
    """Newest first: the newest file's address of a channel is its first choice."""
    if not os.path.isdir(FILES):
        return []
    names = [n for n in os.listdir(FILES) if n.lower().endswith((".m3u", ".m3u8"))]
    return sorted(names, key=lambda n: os.path.getmtime(os.path.join(FILES, n)), reverse=True)


@dataclass
class Channel:
    key: str
    entry: Entry               # how it is listed: the first file's entry
    urls: list = field(default_factory=list)


def merged_channels() -> list[Channel]:
    channels: dict[str, Channel] = {}
    order: list[str] = []
    for name in source_files():
        try:
            with open(os.path.join(FILES, name), encoding="utf-8", errors="replace") as f:
                entries = parse_m3u(f.read())
        except OSError:
            continue
        for e in entries:
            key = channel_key(e)
            ch = channels.get(key)
            if ch is None:
                ch = channels[key] = Channel(key, e)
                order.append(key)
            if e.url not in ch.urls:
                ch.urls.append(e.url)
    return [channels[k] for k in order]


# ---------------------------------------------------------------------------------------------
# Checking
# ---------------------------------------------------------------------------------------------

_ctx = ssl.create_default_context()
_ctx.check_hostname = False
_ctx.verify_mode = ssl.CERT_NONE   # many IPTV hosts have broken certificates; we only test reachability


def _get(url: str, limit: int) -> tuple[int, bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Range": f"bytes=0-{limit - 1}"})
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=_ctx) as r:
        return r.status, r.read(limit), r.geturl()


def check_url(url: str, depth: int = 0) -> bool:
    """True when the address gives a playable stream: a playlist that leads to media, or media bytes."""
    if not url.lower().startswith(("http://", "https://")):
        return False
    try:
        status, body, final = _get(url, 262144)
    except (urllib.error.URLError, OSError, ValueError):
        return False
    if status not in (200, 206) or not body:
        return False
    head = body.lstrip()[:7]
    if head.startswith(b"#EXTM3U"):
        if depth >= 2:
            return True
        text = body.decode("utf-8", "replace")
        for line in text.splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                return check_url(urllib.parse.urljoin(final, line), depth + 1)
        return False
    # Media: an HTML page or JSON error is not a stream.
    lowered = body[:256].lower()
    return not (lowered.lstrip().startswith(b"<") or lowered.lstrip().startswith(b"{"))


def due(info: dict, now: float) -> bool:
    if not info:
        return True
    last = info.get("checked", 0)
    if info.get("dead"):
        return now - last >= DEAD_EVERY
    if info.get("fails", 0) > 0:
        return now - last >= RETRY_GAP
    return now - last >= ALIVE_EVERY


def record(state: dict, url: str, ok: bool, now: float) -> str | None:
    """Stores a check; returns 'died' / 'revived' when the address changed side."""
    info = state["urls"].setdefault(url, {})
    was_dead = info.get("dead", False)
    info["checked"] = now
    if ok:
        info["fails"] = 0
        info["dead"] = False
        info["ok_at"] = now
        return "revived" if was_dead else None
    info["fails"] = info.get("fails", 0) + 1
    if info["fails"] >= FAIL_LIMIT and not was_dead:
        info["dead"] = True
        return "died"
    return None


def check_round(force_new: bool = False) -> dict:
    """Checks every address that is due; returns counts. New addresses are always due."""
    channels = merged_channels()
    now = time.time()
    with lock:
        state = load_state()
        todo = []
        for ch in channels:
            for u in ch.urls:
                info = state["urls"].get(u)
                if force_new and info:
                    continue
                if due(info or {}, now):
                    todo.append(u)
    counts = {"checked": 0, "died": 0, "revived": 0}
    with concurrent.futures.ThreadPoolExecutor(WORKERS) as pool:
        results = list(pool.map(lambda u: (u, check_url(u)), todo))
    with lock:
        state = load_state()
        now = time.time()
        for u, ok in results:
            change = record(state, u, ok, now)
            counts["checked"] += 1
            if change:
                counts[change] += 1
        known = {u for ch in channels for u in ch.urls}
        state["urls"] = {u: v for u, v in state["urls"].items() if u in known}
        build_output(channels, state)
        save_state(state)
    return counts


# ---------------------------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------------------------

def usable(state: dict, url: str) -> bool:
    info = state["urls"].get(url)
    # Not yet checked counts as usable, so a fresh file shows at once; a failing one keeps its place
    # until it is really dead.
    return not (info and info.get("dead"))


def stable_order(channels: list[Channel], state: dict) -> list[Channel]:
    """Channels in the order they first appeared, new ones at the end: a new file never moves the old
    channels, so their numbers stay the same in the app."""
    order = state.setdefault("order", [])
    seen = set(order)
    for ch in channels:
        if ch.key not in seen:
            order.append(ch.key)
            seen.add(ch.key)
    index = {k: i for i, k in enumerate(order)}
    return sorted(channels, key=lambda ch: index[ch.key])


def build_output(channels: list[Channel], state: dict) -> dict:
    channels = stable_order(channels, state)
    lines = ["#EXTM3U"]
    shown = 0
    for ch in channels:
        url = next((u for u in ch.urls if usable(state, u)), None)
        if url is None:
            continue
        shown += 1
        attrs = dict(ch.entry.attrs)
        if ch.entry.group:
            attrs["group-title"] = ch.entry.group
        attr_text = " ".join(f'{k}="{v}"' for k, v in attrs.items())
        lines.append(f"#EXTINF:-1 {attr_text},{ch.entry.name}".replace("  ", " "))
        lines.extend(ch.entry.extras)
        lines.append(url)
    body = "\n".join(lines) + "\n"
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(body)
    os.replace(tmp, OUT)
    return {"channels": len(channels), "shown": shown}


def summary() -> dict:
    channels = merged_channels()
    with lock:
        state = load_state()
    alive = sum(1 for ch in channels if any(usable(state, u) for u in ch.urls))
    dead_urls = sum(1 for v in state["urls"].values() if v.get("dead"))
    return {"files": len(source_files()), "channels": len(channels), "working": alive, "off": len(channels) - alive, "dead_urls": dead_urls}


# ---------------------------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------------------------

class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "SkMatePlaylist/1.0"

    def do_GET(self):  # noqa: N802 (http.server naming)
        path = urllib.parse.urlparse(self.path).path
        if path in ("/playlist.m3u8", "/playlist.m3u"):
            try:
                with open(OUT, "rb") as f:
                    body = f.read()
            except OSError:
                body = b"#EXTM3U\n"
            etag = '"' + hashlib.sha1(body).hexdigest()[:16] + '"'
            if self.headers.get("If-None-Match") == etag:
                self.send_response(304)
                self.send_header("ETag", etag)
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "audio/x-mpegurl; charset=utf-8")
            self.send_header("Cache-Control", "public, max-age=600")
            self.send_header("ETag", etag)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif path == "/health":
            body = json.dumps(summary()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):  # quiet: nginx keeps the access log
        pass


def serve() -> None:
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        httpd.daemon_threads = True
        httpd.serve_forever()


# ---------------------------------------------------------------------------------------------
# Telegram bot
# ---------------------------------------------------------------------------------------------

API = "https://api.telegram.org"


def tg(method: str, **params) -> dict:
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(f"{API}/bot{TOKEN}/{method}", data=data)
    with urllib.request.urlopen(req, timeout=70) as r:
        return json.loads(r.read().decode())


def say(chat: int, text: str) -> None:
    try:
        tg("sendMessage", chat_id=chat, text=text, disable_web_page_preview="true")
    except (urllib.error.URLError, OSError, ValueError) as e:
        print("send failed:", e, file=sys.stderr)


def safe_name(name: str) -> str:
    base = re.sub(r"[^\w.\-]+", "_", os.path.basename(name or "playlist.m3u8"))
    if not base.lower().endswith((".m3u", ".m3u8")):
        base += ".m3u8"
    return time.strftime("%Y%m%d-%H%M%S-") + base


def report(s: dict) -> str:
    return (f"файлов {s['files']}, каналов {s['channels']}\n"
            f"работают {s['working']}, отключены {s['off']}")


def handle(msg: dict) -> None:
    chat = msg["chat"]["id"]
    user = msg.get("from", {}).get("id")
    if user not in ADMINS:
        return  # strangers get no answer at all
    text = (msg.get("text") or "").strip()
    doc = msg.get("document")
    if doc:
        if doc.get("file_size", 0) > MAX_FILE_BYTES:
            say(chat, "файл слишком большой")
            return
        try:
            path = tg("getFile", file_id=doc["file_id"])["result"]["file_path"]
            with urllib.request.urlopen(f"{API}/file/bot{TOKEN}/{path}", timeout=60) as r:
                raw = r.read(MAX_FILE_BYTES + 1)
        except (urllib.error.URLError, OSError, KeyError, ValueError):
            say(chat, "не получилось скачать файл, пришли ещё раз")
            return
        text_body = raw.decode("utf-8", "replace")
        entries = parse_m3u(text_body)
        if not entries:
            say(chat, "в файле нет каналов")
            return
        os.makedirs(FILES, exist_ok=True)
        with open(os.path.join(FILES, safe_name(doc.get("file_name"))), "w", encoding="utf-8") as f:
            f.write(text_body)
        say(chat, f"принял {len(entries)} каналов, проверяю")
        counts = check_round(force_new=True)
        say(chat, f"проверено {counts['checked']}\n" + report(summary()))
    elif text in ("/start", "/help"):
        say(chat, "пришли .m3u или .m3u8 файл, я добавлю каналы\n/status — сколько работает\n/files — список файлов\n/delete N — убрать файл")
    elif text == "/status":
        say(chat, report(summary()))
    elif text == "/files":
        names = source_files()
        say(chat, "\n".join(f"{i + 1}. {n}" for i, n in enumerate(names)) or "файлов нет")
    elif text.startswith("/delete"):
        parts = text.split()
        names = source_files()
        if len(parts) == 2 and parts[1].isdigit() and 1 <= int(parts[1]) <= len(names):
            os.remove(os.path.join(FILES, names[int(parts[1]) - 1]))
            with lock:
                state = load_state()
                build_output(merged_channels(), state)
                save_state(state)
            say(chat, "убрал\n" + report(summary()))
        else:
            say(chat, "напиши /delete и номер из /files")


def bot_loop() -> None:
    offset = 0
    while True:
        try:
            updates = tg("getUpdates", offset=offset, timeout=60).get("result", [])
        except (urllib.error.URLError, OSError, ValueError) as e:
            print("poll failed:", e, file=sys.stderr)
            time.sleep(10)
            continue
        for u in updates:
            offset = u["update_id"] + 1
            msg = u.get("message")
            if msg:
                try:
                    handle(msg)
                except Exception as e:  # one bad message must not stop the bot
                    print("handle failed:", e, file=sys.stderr)


def daily_report(last_day: list) -> None:
    day = time.strftime("%Y-%m-%d")
    if TOKEN and ADMINS and time.strftime("%H") == "09" and last_day[0] != day:
        last_day[0] = day
        for a in ADMINS:
            say(a, "плейлист за сутки\n" + report(summary()))


def checker_loop() -> None:
    last_day = [""]
    while True:
        try:
            counts = check_round()
            if counts["died"] or counts["revived"]:
                print(f"checked {counts['checked']}, died {counts['died']}, revived {counts['revived']}", flush=True)
            daily_report(last_day)
        except Exception as e:  # keep checking whatever one round threw
            print("check round failed:", e, file=sys.stderr)
        time.sleep(60)


def main() -> None:
    os.makedirs(FILES, exist_ok=True)
    with lock:
        state = load_state()
        build_output(merged_channels(), state)
        save_state(state)
    threading.Thread(target=checker_loop, daemon=True).start()
    if TOKEN and ADMINS:
        threading.Thread(target=bot_loop, daemon=True).start()
    else:
        print("bot off: no token or admins yet", flush=True)
    serve()


if __name__ == "__main__":
    main()
