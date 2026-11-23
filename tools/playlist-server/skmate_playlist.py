#!/usr/bin/env python3
"""SkMate playlist service: the author's auto-updated playlist.

The author manages it from a Telegram bot: playlist files or links in, channels checked in the
background, only the working ones served at a single address that the app subscribes to. Only the
standard library is used.

Rules:
  - Channels with the same tvg-id (or, without one, the same normalised name) are one channel; every
    address they come with is kept as a fallback, newest source first.
  - A new address is checked in depth before it is served: the playlist, the variant and a real media
    segment. Until then it is not in the playlist.
  - An address that fails a check (two tries a few seconds apart) leaves the playlist at once. A working
    fallback takes over, in the same place and under the same number. A busy host (5xx, 429, timeout)
    is not a failure: it is asked again later. When most of a round fails, nothing is taken out: that
    is the provider or the network, not the channels.
  - Dead addresses are still checked, less often, and come back by themselves when they work again.
  - A channel the author removes stays out until a newly added source brings it again.
  - The app is never involved: it only downloads the finished playlist.

The bot keeps one message per chat (banner, text, buttons) and edits it in place; whatever the author
sends is read and deleted, so the chat never fills up.

Environment (see deploy notes in README.md next to this file):
  SKMATE_PL_DATA      data directory (files, state, output)          default ./data
  SKMATE_PL_PORT      port of the local HTTP server (behind nginx)   default 18110
  SKMATE_PL_TOKEN     Telegram bot token (bot off when empty)
  SKMATE_PL_ADMINS    Telegram user ids allowed to manage it, comma separated
  SKMATE_PL_PUBLIC    public address of the playlist, shown in the bot
"""

from __future__ import annotations

import concurrent.futures
import hashlib
import html
import http.server
import json
import os
import re
import socketserver
import socket
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import skmate_remote as remote
from dataclasses import dataclass, field

DATA = os.path.abspath(os.environ.get("SKMATE_PL_DATA", "data"))
PORT = int(os.environ.get("SKMATE_PL_PORT", "18110"))
TOKEN = os.environ.get("SKMATE_PL_TOKEN", "").strip()
ADMINS = {int(x) for x in os.environ.get("SKMATE_PL_ADMINS", "").replace(" ", "").split(",") if x}
PUBLIC = os.environ.get("SKMATE_PL_PUBLIC", "https://nutrokstore.xyz/skmate/playlist.m3u8").strip()

HERE = os.path.dirname(os.path.abspath(__file__))
BANNER = os.path.join(HERE, "banner.jpg")
FILES = os.path.join(DATA, "files")
STATE = os.path.join(DATA, "state.json")
OUT = os.path.join(DATA, "playlist.m3u8")

RETRY_GAP = 10 * 60            # seconds between checks of a failing address
ALIVE_EVERY = 2 * 3600         # a working address is checked again after this
DEAD_EVERY = 6 * 3600          # a dead address is tried again after this
TRIES = 2                      # tries per check, TRY_GAP apart, so one dropped request is not a death
TRY_GAP = 3                    # seconds
SEGMENT_BYTES = 65536          # read of a media segment
SOURCE_EVERY = 6 * 3600        # a source added by link is downloaded again after this
WORKERS = 4                    # checks at once: more and the provider answers 503
TIMEOUT = 10                   # seconds per request
USER_AGENT = "SkMate-IPTV-check/1.0"
MAX_FILE_BYTES = 20 * 1024 * 1024
PAGE = 8                       # channels per page in the bot

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


def header_epg(text: str) -> list[str]:
    """Guide addresses a playlist names in its #EXTM3U line."""
    for line in text.splitlines()[:5]:
        if line.strip().startswith("#EXTM3U"):
            attrs = dict(ATTR.findall(line))
            raw = attrs.get("url-tvg") or attrs.get("x-tvg-url") or ""
            return [u.strip() for u in raw.split(",") if u.strip()]
    return []


def channel_key(e: Entry) -> str:
    tvg = e.attrs.get("tvg-id", "").strip().lower()
    if tvg:
        return "id:" + tvg
    name = e.name.lower()
    name = re.sub(r"[\[\(].*?[\]\)]", " ", name)
    name = re.sub(r"\b(fhd|uhd|hd|sd|4k|orig|backup|резерв)\b", " ", name)
    name = re.sub(r"[^\w]+", " ", name, flags=re.UNICODE)
    return "name:" + " ".join(name.split())


def short_id(text: str) -> str:
    return hashlib.sha1(text.encode()).hexdigest()[:10]


# ---------------------------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------------------------

def load_state() -> dict:
    try:
        with open(STATE, encoding="utf-8") as f:
            state = json.load(f)
    except (OSError, ValueError):
        state = {}
    for k, v in (("urls", {}), ("sources", {}), ("removed", []), ("overrides", {}), ("epg", []), ("ui", {})):
        state.setdefault(k, v)
    return state


def save_state(state: dict) -> None:
    tmp = STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False)
    os.replace(tmp, STATE)


def source_meta(state: dict, name: str) -> dict:
    meta = state["sources"].get(name)
    if meta is None:
        path = os.path.join(FILES, name)
        meta = {"kind": "file", "name": name.split("-", 2)[-1], "added": os.path.getmtime(path) if os.path.exists(path) else 0}
    return meta


def source_files(state: dict | None = None) -> list[str]:
    """Newest first: the newest source's address of a channel is its first choice."""
    if not os.path.isdir(FILES):
        return []
    state = state or load_state()
    names = [n for n in os.listdir(FILES) if n.lower().endswith((".m3u", ".m3u8"))]
    return sorted(names, key=lambda n: source_meta(state, n).get("added", 0), reverse=True)


@dataclass
class Channel:
    key: str
    entry: Entry               # how it is listed: the first source's entry
    urls: list = field(default_factory=list)

    @property
    def id(self) -> str:
        return short_id(self.key)


def read_source(name: str) -> str:
    try:
        with open(os.path.join(FILES, name), encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def merged_channels(state: dict | None = None) -> list[Channel]:
    state = state or load_state()
    removed = set(state["removed"])
    channels: dict[str, Channel] = {}
    order: list[str] = []
    for name in source_files(state):
        for e in parse_m3u(read_source(name)):
            key = channel_key(e)
            if key in removed:
                continue
            ch = channels.get(key)
            if ch is None:
                ch = channels[key] = Channel(key, e)
                order.append(key)
            if e.url not in ch.urls:
                ch.urls.append(e.url)
    for key, over in state["overrides"].items():
        ch = channels.get(key)
        if ch and over.get("tvg-id"):
            ch.entry.attrs["tvg-id"] = over["tvg-id"]
    return stable_order([channels[k] for k in order], state)


def stable_order(channels: list[Channel], state: dict) -> list[Channel]:
    """Channels in the order they first appeared, new ones at the end: a new source never moves the
    old channels, so their numbers stay the same in the app."""
    order = state.setdefault("order", [])
    seen = set(order)
    for ch in channels:
        if ch.key not in seen:
            order.append(ch.key)
            seen.add(ch.key)
    index = {k: i for i, k in enumerate(order)}
    return sorted(channels, key=lambda ch: index[ch.key])


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


def _is_media(body: bytes) -> bool:
    """MPEG-TS, fragmented MP4 or ADTS/ID3 audio: bytes a player can decode, not an error page."""
    if len(body) >= 189 and body[0] == 0x47 and body[188] == 0x47:
        return True
    if body[4:8] in (b"ftyp", b"moof", b"styp", b"sidx", b"moov"):
        return True
    if body[:3] == b"ID3" or (len(body) > 1 and body[0] == 0xFF and body[1] & 0xF0 == 0xF0):
        return True
    return False


def _next_uri(text: str) -> str | None:
    """A master playlist: its first variant. A media playlist: its newest segment, the one that is
    surely still on the server (the oldest in a live window can expire while it is fetched)."""
    uris = [line.strip() for line in text.splitlines() if line.strip() and not line.strip().startswith("#")]
    if not uris:
        return None
    return uris[0] if "#EXT-X-STREAM-INF" in text else uris[-1]


OK, DEAD, UNSURE = "ok", "dead", "unsure"


def _probe(url: str, depth: int = 0) -> str:
    """Follows master -> variant -> segment and wants real media bytes at the end. UNSURE when the
    host is busy or slow (5xx, 429, timeout): that says nothing about the channel."""
    if not url.lower().startswith(("http://", "https://")) or depth > 3:
        return DEAD
    try:
        status, body, final = _get(url, 262144 if depth == 0 else SEGMENT_BYTES)
    except urllib.error.HTTPError as e:
        return UNSURE if e.code == 429 or e.code >= 500 else DEAD
    except (TimeoutError, socket.timeout):
        return UNSURE
    except (urllib.error.URLError, OSError, ValueError) as e:
        reason = getattr(e, "reason", None)
        return UNSURE if isinstance(reason, (TimeoutError, socket.timeout)) else DEAD
    if status not in (200, 206) or not body:
        return DEAD
    if body.lstrip()[:7].startswith(b"#EXTM3U"):
        nxt = _next_uri(body.decode("utf-8", "replace"))
        if nxt is None:
            return DEAD
        return _probe(urllib.parse.urljoin(final, nxt), depth + 1)
    lowered = body[:256].lstrip().lower()
    if lowered.startswith(b"<") or lowered.startswith(b"{"):
        return DEAD
    # A direct stream (depth 0) or a segment: it must look like media.
    return OK if _is_media(body) else DEAD


def check_url(url: str) -> str:
    """OK when the whole chain down to a media segment answers on any of TRIES tries; DEAD when every
    try says so; UNSURE otherwise."""
    seen = []
    for attempt in range(TRIES):
        if attempt:
            time.sleep(TRY_GAP)
        r = _probe(url)
        if r == OK:
            return OK
        seen.append(r)
    return DEAD if all(r == DEAD for r in seen) else UNSURE


def due(info: dict, now: float) -> bool:
    if not info:
        return True
    last = info.get("checked", 0)
    if info.get("dead"):
        return now - last >= DEAD_EVERY
    if info.get("fails", 0) > 0 or not info.get("ok_at"):
        return now - last >= RETRY_GAP
    return now - last >= ALIVE_EVERY


def record(state: dict, url: str, result: str, now: float) -> str | None:
    """Stores a check; returns 'died' / 'revived' when the address changed side. DEAD takes it out at
    once; UNSURE keeps it as it was and asks again after RETRY_GAP."""
    info = state["urls"].setdefault(url, {})
    was_dead = info.get("dead", False)
    info["checked"] = now
    if result == OK:
        info["fails"] = 0
        info["dead"] = False
        info["ok_at"] = now
        return "revived" if was_dead else None
    info["fails"] = info.get("fails", 0) + 1
    if result == DEAD and not was_dead:
        info["dead"] = True
        return "died"
    return None


def check_urls(urls: list[str], manual: bool = False) -> dict:
    counts = {"checked": 0, "died": 0, "revived": 0, "failed": 0, "unsure": 0, "held": False}
    if urls:
        with concurrent.futures.ThreadPoolExecutor(WORKERS) as pool:
            results = list(pool.map(lambda u: (u, check_url(u)), urls))
    else:
        results = []
    bad = sum(1 for _, r in results if r != OK)
    # Most of a round failing is the host or the network, not the channels: nothing dies on it.
    held = len(results) >= 20 and bad * 2 > len(results)
    counts["held"] = held
    with lock:
        state = load_state()
        now = time.time()
        for u, r in results:
            if held and r == DEAD:
                r = UNSURE
            change = record(state, u, r, now)
            counts["checked"] += 1
            if r != OK:
                counts["failed"] += 1
            if r == UNSURE:
                counts["unsure"] += 1
            if change:
                counts[change] += 1
        channels = merged_channels(state)
        known = {u for ch in channels for u in ch.urls}
        state["urls"] = {u: v for u, v in state["urls"].items() if u in known}
        state["last_check"] = now
        build_output(channels, state)
        save_state(state)
    return counts


def check_round(force: str = "") -> dict:
    """Checks every address that is due. force='new' adds unchecked ones only, 'all' takes all."""
    with lock:
        state = load_state()
        channels = merged_channels(state)
        save_state(state)
    now = time.time()
    todo = []
    for ch in channels:
        for u in ch.urls:
            info = state["urls"].get(u) or {}
            if force == "all" or (force == "new" and not info) or (force != "new" and due(info, now)):
                todo.append(u)
    return check_urls(todo)


# ---------------------------------------------------------------------------------------------
# Sources by link
# ---------------------------------------------------------------------------------------------

def download(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (SkMate playlist)"})
    with urllib.request.urlopen(req, timeout=60, context=_ctx) as r:
        raw = r.read(MAX_FILE_BYTES + 1)
    if len(raw) > MAX_FILE_BYTES:
        raise ValueError("too big")
    return raw.decode("utf-8", "replace")


def add_source(text: str, kind: str, name: str, url: str = "") -> int:
    """Stores a playlist as a source; returns how many channels it has (0: nothing stored)."""
    entries = parse_m3u(text)
    if not entries:
        return 0
    os.makedirs(FILES, exist_ok=True)
    with lock:
        state = load_state()
        if kind == "url":
            fname = next((n for n, m in state["sources"].items() if m.get("url") == url), None) or f"url-{short_id(url)}.m3u8"
        else:
            base = re.sub(r"[^\w.\-]+", "_", os.path.basename(name or "playlist.m3u8"))
            if not base.lower().endswith((".m3u", ".m3u8")):
                base += ".m3u8"
            fname = time.strftime("%Y%m%d-%H%M%S-") + base
        with open(os.path.join(FILES, fname), "w", encoding="utf-8") as f:
            f.write(text)
        now = time.time()
        meta = state["sources"].get(fname) or {"added": now}
        meta.update({"kind": kind, "name": name, "fetched": now, "error": ""})
        if url:
            meta["url"] = url
        state["sources"][fname] = meta
        # The author brought these channels again: a channel removed earlier comes back with them.
        again = {channel_key(e) for e in entries}
        state["removed"] = [k for k in state["removed"] if k not in again]
        # No rebuild here: the playlist changes only after the check that follows, so new addresses
        # are never served unchecked and a refreshed source does not blink out meanwhile.
        save_state(state)
    return len(entries)


def refresh_source(fname: str) -> int:
    with lock:
        meta = dict(load_state()["sources"].get(fname) or {})
    if meta.get("kind") != "url":
        return -1
    try:
        return add_source(download(meta["url"]), "url", meta.get("name", ""), meta["url"])
    except (urllib.error.URLError, OSError, ValueError) as e:
        with lock:
            state = load_state()
            if fname in state["sources"]:
                state["sources"][fname]["error"] = str(e)[:120]
                state["sources"][fname]["fetched"] = time.time()
                save_state(state)
        return -1


def refresh_due_sources(force: bool = False) -> None:
    with lock:
        state = load_state()
        names = [n for n, m in state["sources"].items()
                 if m.get("kind") == "url" and (force or time.time() - m.get("fetched", 0) >= SOURCE_EVERY)]
    for n in names:
        refresh_source(n)


def remove_source(fname: str) -> None:
    with lock:
        try:
            os.remove(os.path.join(FILES, fname))
        except OSError:
            pass
        state = load_state()
        state["sources"].pop(fname, None)
        build_output(merged_channels(state), state)
        save_state(state)


# ---------------------------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------------------------

def usable(state: dict, url: str) -> bool:
    info = state["urls"].get(url)
    # Only a checked, working address is served: a new one waits for its check, a failed one is out.
    return bool(info and info.get("ok_at") and not info.get("dead"))


def epg_list(state: dict) -> list[str]:
    if state["epg"]:
        return list(state["epg"])
    found: list[str] = []
    for name in source_files(state):
        for u in header_epg(read_source(name)):
            if u not in found:
                found.append(u)
    return found


def build_output(channels: list[Channel], state: dict) -> dict:
    epg = epg_list(state)
    lines = ['#EXTM3U url-tvg="' + ",".join(epg) + '"' if epg else "#EXTM3U"]
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
        lines.append(f"#EXTINF:-1 {attr_text},{ch.entry.name}" if attr_text else f"#EXTINF:-1,{ch.entry.name}")
        lines.extend(ch.entry.extras)
        lines.append(url)
    body = "\n".join(lines) + "\n"
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(body)
    os.replace(tmp, OUT)
    return {"channels": len(channels), "shown": shown}


def rebuild() -> None:
    with lock:
        state = load_state()
        build_output(merged_channels(state), state)
        save_state(state)


def channel_status(state: dict, ch: Channel) -> str:
    """'ok', 'dead' or 'wait' (nothing checked yet)."""
    infos = [state["urls"].get(u) for u in ch.urls]
    if any(i and not i.get("dead") and i.get("ok_at") for i in infos):
        return "ok"
    if infos and all(i and i.get("dead") for i in infos):
        return "dead"
    return "wait"


def summary() -> dict:
    with lock:
        state = load_state()
        channels = merged_channels(state)
    alive = sum(1 for ch in channels if any(usable(state, u) for u in ch.urls))
    dead_urls = sum(1 for v in state["urls"].values() if v.get("dead"))
    return {"files": len(source_files(state)), "channels": len(channels), "working": alive,
            "off": len(channels) - alive, "dead_urls": dead_urls}


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
        elif path == "/tv/poll":
            # The device's secret comes in headers, never in the address (nginx logs addresses).
            r = remote.poll(self.headers.get("X-Device", ""), self.headers.get("X-Secret", ""))
            self._json(r, 403 if r is None else 200)
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

    def _json(self, obj, code: int = 200) -> None:
        body = json.dumps(obj if obj is not None else {"error": "auth"}, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):  # noqa: N802
        path = urllib.parse.urlparse(self.path).path
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 256 * 1024:
                raise ValueError("too big")
            body = json.loads(self.rfile.read(n) or b"{}")
            if not isinstance(body, dict):
                raise ValueError("not an object")
        except (ValueError, OSError):
            self._json({"error": "bad request"}, 400)
            return
        d, s = str(body.get("device", "")), str(body.get("secret", ""))
        try:
            if path == "/tv/register":
                self._json(remote.register(d, str(body.get("name", "")), s))
            elif path == "/tv/code":
                r = remote.new_code(d, s)
                self._json(r, 403 if r is None else 200)
            elif path == "/tv/reply":
                ok = remote.reply(d, s, str(body.get("id", "")), body.get("result"))
                self._json({"ok": ok}, 200 if ok else 403)
            elif path == "/tv/unlink":
                ok = remote.unlink_device(d, s)
                self._json({"ok": ok}, 200 if ok else 403)
            else:
                self._json({"error": "not found"}, 404)
        except ValueError:
            self._json({"error": "bad request"}, 400)

    def log_message(self, *args):  # quiet: nginx keeps the access log
        pass


def serve() -> None:
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        httpd.daemon_threads = True
        httpd.serve_forever()


# ---------------------------------------------------------------------------------------------
# Telegram: transport
# ---------------------------------------------------------------------------------------------

API = "https://api.telegram.org"


class TgError(Exception):
    pass


def tg(method: str, **params) -> dict:
    body = json.dumps({k: v for k, v in params.items() if v is not None}).encode()
    req = urllib.request.Request(f"{API}/bot{TOKEN}/{method}", data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=70) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            desc = json.loads(e.read().decode()).get("description", "")
        except ValueError:
            desc = str(e)
        raise TgError(desc) from None


def tg_photo(chat: int, caption: str, markup: dict) -> dict:
    """Sends the banner: by file_id when Telegram already has it, otherwise uploads it once."""
    with lock:
        file_id = load_state().get("banner_id")
    if file_id:
        try:
            return tg("sendPhoto", chat_id=chat, photo=file_id, caption=caption, parse_mode="HTML", reply_markup=markup)
        except TgError:
            pass
    boundary = uuid.uuid4().hex
    parts = []
    for k, v in (("chat_id", str(chat)), ("caption", caption), ("parse_mode", "HTML"), ("reply_markup", json.dumps(markup))):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    with open(BANNER, "rb") as f:
        img = f.read()
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="photo"; filename="banner.jpg"\r\n'
                 f"Content-Type: image/jpeg\r\n\r\n".encode() + img + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(f"{API}/bot{TOKEN}/sendPhoto", data=b"".join(parts),
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=70) as r:
        res = json.loads(r.read().decode())
    photos = res.get("result", {}).get("photo") or []
    if photos:
        with lock:
            state = load_state()
            state["banner_id"] = photos[-1]["file_id"]
            save_state(state)
    return res


def quiet(method: str, **params) -> None:
    try:
        tg(method, **params)
    except (TgError, urllib.error.URLError, OSError, ValueError):
        pass


# ---------------------------------------------------------------------------------------------
# Telegram: look
# ---------------------------------------------------------------------------------------------

# Animated emoji from the "Kawaii Emoji" set (t.me/addemoji/AnimatedAsianEmoji). They show because
# the bot's owner has Telegram Premium; everyone else sees the plain emoji.
EMOJI = {
    "👋": "5343984088493599366", "✨": "5463297803235113601", "➕": "5361847815255372871",
    "⭐️": "5463289097336405244", "💎": "5235630047959727475", "🤓": "5452136652111620778",
    "⚡️": "5258203794772085854", "🔥": "5389038097860144794", "💀": "5379930048478330552",
    "🫡": "5316805299221316044", "👌": "5345927337856740600", "🤩": "5330356071364046086",
    "💔": "5273842895978251304", "👍": "5458485283790004353", "👎": "5456378804194781781",
    "💪": "5344040305320536399", "😵": "5425099278932517859", "🤔": "5350705145376156068",
    "🌟": "5208801655004350721", "🔋": "5328201028573609878", "😱": "5310134115498993485",
    "🥳": "5328273248448686763", "😢": "5391310895768936514", "💯": "5274195706066781810",
    "☕️": "5395463497783983254", "👑": "5431505596316665041", "❓": "5235711188481883685",
}
# Button icons from the "Telegram iOS Icons" set (t.me/addemoji/tgiosicons): plain, single-colour, the
# way a TV's own menus draw them. The text keeps the animated set above.
ICON = {
    "add": "6032924188828767321",  # ➕
    "channels": "6039391078136681499",  # 📺
    "sources": "6039630677182254664",  # 📂
    "guide": "5890937706803894250",  # 📅
    "check": "5769248574499983619",  # 🔄
    "link": "6030864215139422409",  # 🔗
    "wipe": "6039522349517115015",  # 🗑
    "back": "5960671702059848143",  # ⬅️
    "open": "5776233299424843260",  # 🌐
    "test": "6032850693348399258",  # 🔎
    "delete": "6039522349517115015",  # 🗑
    "cancel": "6030757850274336631",  # ❌
    "refresh": "5767310088255576068",  # 🔃
    "main": "6028338546736107668",  # ⭐️
    "guide_item": "5891100675042974129",  # 📅
    "file": "6034969813032374911",  # 📄
    "url": "5776078972659962594",  # 🔗
    "error": "6030563507299160824",  # ❗️
    "ok": "5774022692642492953",  # ✅
    "dead": "5938215362473496448",  # 🚫
    "wait": "6030537810509828330",  # ⏲
    "prev": "6039539366177541657",  # ⬅️
    "next": "5895383238473421210",  # ➡️
    "yes": "6039522349517115015",  # 🗑
}
STATUS_ICON = {"ok": "💪", "dead": "😵", "wait": "🤔"}
STATUS_TEXT = {"ok": "работает", "dead": "не работает", "wait": "ещё не проверен"}


FOOTER = '<tg-emoji emoji-id="5960671702059848143">⬅️</tg-emoji> Выберите кнопку ниже:'


def e(ch: str) -> str:
    """An animated emoji from the pack, or the plain one when the pack has none for it."""
    eid = EMOJI.get(ch)
    return f'<tg-emoji emoji-id="{eid}">{ch}</tg-emoji>' if eid else ch


def h(text: str) -> str:
    return html.escape(str(text), quote=False)


def btn(text: str, data: str = "", icon: str = "", style: str = "", url: str = "", copy: str = "") -> dict:
    b: dict = {"text": text}
    if url:
        b["url"] = url
    elif copy:
        b["copy_text"] = {"text": copy[:256]}
    else:
        b["callback_data"] = data
    if icon:
        b["icon_custom_emoji_id"] = ICON[icon]
    if style:
        b["style"] = style
    return b


def openable(url: str) -> bool:
    return url.lower().startswith(("http://", "https://")) and len(url) < 1000 and not re.search(r"\s", url)


def without_links(markup: dict) -> dict:
    return {"inline_keyboard": [r for r in ([b for b in row if "url" not in b] for row in markup["inline_keyboard"]) if r]}


def kb(*rows: list) -> dict:
    return {"inline_keyboard": [r for r in rows if r]}


def back(to: str = "home") -> list:
    return [btn("Назад", to, "back")]


def plural(n: int, one: str, few: str, many: str) -> str:
    if n % 10 == 1 and n % 100 != 11:
        return f"{n} {one}"
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return f"{n} {few}"
    return f"{n} {many}"


def channels_word(n: int) -> str:
    return plural(n, "канал", "канала", "каналов")


def ago(ts: float) -> str:
    if not ts:
        return "ещё не было"
    m = int((time.time() - ts) // 60)
    if m < 1:
        return "только что"
    if m < 60:
        return plural(m, "минуту", "минуты", "минут") + " назад"
    return plural(m // 60, "час", "часа", "часов") + " назад"


def short(text: str, n: int) -> str:
    return text if len(text) <= n else text[: n - 1] + "…"


def visible(caption: str) -> int:
    return len(html.unescape(re.sub(r"<[^>]+>", "", caption)))


def fit(caption: str) -> str:
    """Telegram takes 1024 characters of caption text: long lists lose whole lines from the end.
    Only a blockquote spans lines, so closing it is all the markup that can be left open."""
    lines = caption.split("\n")
    while len(lines) > 1 and visible("\n".join(lines)) > 1000:
        lines.pop()
    out = "\n".join(lines)
    if out != caption:
        if out.count("<blockquote") > out.count("</blockquote>"):
            out += "</blockquote>"
        out += "\n…"
    return out


# ---------------------------------------------------------------------------------------------
# Telegram: screens
# ---------------------------------------------------------------------------------------------

def screen_home(ui: dict) -> tuple[str, dict]:
    with lock:
        state = load_state()
        channels = merged_channels(state)
    ok = sum(1 for c in channels if channel_status(state, c) == "ok")
    dead = sum(1 for c in channels if channel_status(state, c) == "dead")
    text = (f"{e('👋')} <b>Привет, {h(ui.get('first') or 'автор')}!</b>\n\n"
            f"<blockquote>{e('✨')} <b>Плейлист SkMate</b>\n"
            f"• Каналов: <b>{len(channels)}</b>, работают <b>{ok}</b>, не работают <b>{dead}</b>\n"
            f"• Источников: <b>{len(source_files(state))}</b>, телегид: <b>{len(epg_list(state))}</b>\n"
            f"• Проверка: {ago(state.get('last_check', 0))}</blockquote>\n\n"
            f"{e('🔥')} <i>Ссылка для приложения:</i>\n<code>{h(PUBLIC)}</code>")
    markup = kb(
        [btn("Добавить", "add", "add", "success")],
        [btn("Каналы", "ch:0", "channels"), btn("Источники", "src", "sources")],
        [btn("Телегид", "epg", "guide"), btn("Проверка", "chk", "check", "primary")],
        [btn("Ссылка", copy=PUBLIC, icon="link"), btn("Очистка", "wipe1", "wipe", "danger")],
        [btn("Пульт телевизора", "r", "channels", "primary")],
    )
    return text, markup


def screen_add() -> tuple[str, dict]:
    text = (f"{e('➕')} <b>Добавить каналы</b>\n\n"
            f"<blockquote>Пришли сюда <b>файл</b> .m3u / .m3u8 или <b>ссылку</b> на плейлист.\n"
            f"Ссылку я буду скачивать заново каждые 6 часов.\n"
            f"Одинаковые каналы склеятся, новые адреса станут запасными.</blockquote>")
    return text, kb(back())


def screen_channels(page: int) -> tuple[str, dict]:
    with lock:
        state = load_state()
        channels = merged_channels(state)
    pages = max(1, (len(channels) + PAGE - 1) // PAGE)
    page = max(0, min(page, pages - 1))
    part = channels[page * PAGE:(page + 1) * PAGE]
    ok = sum(1 for c in channels if channel_status(state, c) == "ok")
    text = (f"{e('⭐️')} <b>Каналы</b>\n\n"
            f"<blockquote>Всего <b>{len(channels)}</b>, работают <b>{ok}</b>\n"
            f"{e('💪')} работает  {e('😵')} не работает  {e('🤔')} ждёт проверки</blockquote>")
    if not channels:
        text += "\n\nПока пусто: добавь файл или ссылку."
    rows = []
    for i, c in enumerate(part):
        n = page * PAGE + i + 1
        rows.append([btn(f"{n}. {short(c.entry.name or '?', 30)}", f"c:{c.id}:{page}", channel_status(state, c))])
    nav = []
    if pages > 1:
        nav = [btn("Ранее", f"ch:{(page - 1) % pages}", "prev"), btn(f"{page + 1} / {pages}", f"ch:{page}"),
               btn("Дальше", f"ch:{(page + 1) % pages}", "next")]
    return text, kb(*rows, nav, back())


def find_channel(cid: str) -> tuple[dict, Channel | None]:
    with lock:
        state = load_state()
        channels = merged_channels(state)
    return state, next((c for c in channels if c.id == cid), None)


def screen_channel(cid: str, page: int) -> tuple[str, dict]:
    state, c = find_channel(cid)
    if c is None:
        return screen_channels(page)
    status = channel_status(state, c)
    tvg = c.entry.attrs.get("tvg-id", "")
    lines = []
    for u in c.urls[:8]:
        info = state["urls"].get(u) or {}
        mark = "😵" if info.get("dead") else ("💪" if info.get("ok_at") else "🤔")
        lines.append(f"{e(mark)} <code>{h(short(u, 160))}</code>")
    text = (f"{e(STATUS_ICON[status])} <b>{h(c.entry.name)}</b>\n\n"
            f"<blockquote>• Статус: {STATUS_TEXT[status]}\n"
            f"• Группа: {h(c.entry.group or 'без группы')}\n"
            f"• Телегид (tvg-id): <code>{h(tvg or 'нет')}</code>\n"
            f"• Адресов: {len(c.urls)}</blockquote>\n"
            f"<blockquote expandable>{chr(10).join(lines)}</blockquote>")
    main = next((u for u in c.urls if usable(state, u)), c.urls[0] if c.urls else "")
    first = [btn("Ссылка", copy=main, icon="link")] if main else []
    if openable(main):
        first.append(btn("Открыть", url=main, icon="open"))
    return fit(text), kb(
        first,
        [btn("Проверить", f"cc:{cid}:{page}", "test", "primary"), btn("Телегид", f"ct:{cid}:{page}", "guide")],
        [btn("Удалить", f"cd:{cid}:{page}", "delete", "danger")],
        back(f"ch:{page}"),
    )


def screen_channel_delete(cid: str, page: int) -> tuple[str, dict]:
    _, c = find_channel(cid)
    name = c.entry.name if c else "канал"
    text = (f"{e('😱')} <b>Удалить «{h(name)}»?</b>\n\n"
            f"<blockquote>Канал пропадёт из плейлиста у всех. Вернётся, только если снова прислать "
            f"источник, где он есть.</blockquote>")
    return text, kb([btn("Удалить", f"cx:{cid}:{page}", "delete", "danger"), btn("Отмена", f"c:{cid}:{page}", "cancel")])


def screen_channel_tvg(cid: str) -> tuple[str, dict]:
    _, c = find_channel(cid)
    name = c.entry.name if c else "канал"
    tvg = c.entry.attrs.get("tvg-id", "") if c else ""
    text = (f"{e('🤓')} <b>Телегид для «{h(name)}»</b>\n\n"
            f"<blockquote>Сейчас: <code>{h(tvg or 'нет')}</code>\n"
            f"Пришли новый <b>tvg-id</b> так, как он записан в телегиде, например <code>first.ru</code>.\n"
            f"Минус <code>-</code> вернёт исходный.</blockquote>")
    return text, kb(back(f"c:{cid}:0"))


def sources_list(state: dict) -> list[tuple[str, dict]]:
    return [(n, source_meta(state, n)) for n in source_files(state)]


def screen_sources() -> tuple[str, dict]:
    with lock:
        state = load_state()
    items = sources_list(state)
    text = (f"{e('💎')} <b>Источники</b>\n\n"
            f"<blockquote>Свежий источник важнее: его адрес канала идёт первым, остальные запасные.\n"
            f"Ссылки скачиваются заново каждые 6 часов.</blockquote>")
    if not items:
        text += "\n\nИсточников нет."
    rows = []
    for i, (n, m) in enumerate(items[:20]):
        icon = "error" if m.get("error") else ("url" if m.get("kind") == "url" else "file")
        rows.append([btn(f"{i + 1}. {short(m.get('name') or n, 32)}", f"s:{short_id(n)}", icon)])
    return text, kb(*rows, [btn("Добавить", "add", "add", "success")], back())


def find_source(sid: str) -> tuple[str, dict] | tuple[None, None]:
    with lock:
        state = load_state()
    for n, m in sources_list(state):
        if short_id(n) == sid:
            return n, m
    return None, None


def screen_source(sid: str) -> tuple[str, dict]:
    n, m = find_source(sid)
    if n is None:
        return screen_sources()
    count = len(parse_m3u(read_source(n)))
    kind = "ссылка" if m.get("kind") == "url" else "файл"
    text = (f"{e('💎')} <b>{h(m.get('name') or n)}</b>\n\n"
            f"<blockquote>• Тип: {kind}\n"
            f"• Каналов: <b>{count}</b>\n"
            f"• Добавлен: {time.strftime('%d.%m.%Y %H:%M', time.localtime(m.get('added', 0)))}")
    if m.get("kind") == "url":
        text += f"\n• Обновлён: {ago(m.get('fetched', 0))}"
        if m.get("error"):
            text += f"\n• {e('😢')} Не скачался: {h(m['error'])}"
    text += "</blockquote>"
    if m.get("url"):
        text += f"\n<code>{h(short(m['url'], 300))}</code>"
    first = []
    if m.get("url"):
        first = [btn("Ссылка", copy=m["url"], icon="link"), btn("Обновить", f"sr:{sid}", "refresh", "primary")]
    return fit(text), kb(first, [btn("Удалить", f"sd:{sid}", "delete", "danger")], back("src"))


def screen_source_delete(sid: str) -> tuple[str, dict]:
    n, m = find_source(sid)
    name = (m or {}).get("name") or n or "источник"
    text = (f"{e('😱')} <b>Удалить источник «{h(name)}»?</b>\n\n"
            f"<blockquote>Его каналы останутся, только если они есть в других источниках.</blockquote>")
    return text, kb([btn("Удалить", f"sx:{sid}", "delete", "danger"), btn("Отмена", f"s:{sid}", "cancel")])


def screen_epg() -> tuple[str, dict]:
    with lock:
        state = load_state()
    own = state["epg"]
    shown = epg_list(state)
    text = (f"{e('🤓')} <b>Телегид</b>\n\n"
            f"<blockquote>Адреса телегида уходят в плейлист, приложение подтянет их само.\n"
            f"Каналы сопоставляются по tvg-id, его можно поменять в карточке канала.</blockquote>")
    if shown and not own:
        text += "\n\nСейчас берётся из источников:\n" + "\n".join(f"<code>{h(short(u, 120))}</code>" for u in shown)
    elif not shown:
        text += "\n\nТелегид не задан."
    rows = [[btn(f"{i + 1}. {short(urllib.parse.urlparse(u).netloc or u, 32)}", f"g:{short_id(u)}", "guide_item")] for i, u in enumerate(own)]
    return fit(text), kb(*rows, [btn("Добавить", "ga", "add", "success")], back())


def screen_epg_add() -> tuple[str, dict]:
    text = (f"{e('🤓')} <b>Добавить телегид</b>\n\n"
            f"<blockquote>Пришли ссылку на телегид XMLTV (.xml или .xml.gz).</blockquote>")
    return text, kb(back("epg"))


def find_epg(gid: str) -> str | None:
    with lock:
        return next((u for u in load_state()["epg"] if short_id(u) == gid), None)


def screen_epg_item(gid: str) -> tuple[str, dict]:
    u = find_epg(gid)
    if u is None:
        return screen_epg()
    text = (f"{e('☕️')} <b>Телегид</b>\n\n<code>{h(u)}</code>\n\n"
            f"<blockquote>«Единый» оставит только этот телегид для всех каналов.</blockquote>")
    return fit(text), kb(
        [btn("Ссылка", copy=u, icon="link"), btn("Открыть", url=u, icon="open")] if openable(u) else [btn("Ссылка", copy=u, icon="link")],
        [btn("Единый", f"gm:{gid}", "main", "primary"), btn("Удалить", f"gd:{gid}", "delete", "danger")],
        back("epg"),
    )


WIPE = {
    1: ("Удалить всё?", "Пропадут все каналы и источники. Телегид останется."),
    2: ("Точно удалить?", "Плейлист у всех зрителей станет пустым при следующем обновлении."),
    3: ("Последний шаг", "Отменить потом нельзя."),
}


def screen_wipe(step: int) -> tuple[str, dict]:
    title, note = WIPE[step]
    text = f"{e('😱')} <b>{title}</b>  <i>{step} / 3</i>\n\n<blockquote>{note}</blockquote>"
    yes = btn("Удалить" if step == 3 else "Да", "wipe" + str(step + 1) if step < 3 else "wipex", "yes", "danger")
    no = btn("Отмена", "home", "cancel")
    # The buttons swap sides on every step, so three quick taps in one place never wipe anything.
    return text, kb([yes, no] if step % 2 else [no, yes])


# ---------------------------------------------------------------------------------------------
# Telegram: the one message
# ---------------------------------------------------------------------------------------------

def get_ui(chat: int) -> dict:
    with lock:
        return dict(load_state()["ui"].get(str(chat)) or {})


def set_ui(chat: int, **changes) -> dict:
    with lock:
        state = load_state()
        ui = state["ui"].setdefault(str(chat), {})
        ui.update(changes)
        save_state(state)
        return dict(ui)


def rich(text: str) -> str:
    """The bot's screen text as rich-message HTML: blank lines split paragraphs, a newline is a line break."""
    out = []
    for para in text.split("\n\n"):
        para = para.strip("\n")
        if not para:
            continue
        body = para.replace("\n", "<br/>")
        out.append(body if body.startswith("<blockquote") else f"<p>{body}</p>")
    return "".join(out)


def rich_message(text: str) -> dict:
    """Banner on top, the screen, and the small line under it that points at the buttons."""
    with lock:
        file_id = load_state().get("banner_id")
    head = '<img src="tg://photo?id=banner"/>' if file_id else ""
    msg = {"html": head + rich(text) + f"<footer>{FOOTER}</footer>"}
    if file_id:
        msg["media"] = [{"id": "banner", "media": {"type": "photo", "media": file_id}}]
    return msg


def show(chat: int, text: str, markup: dict, note: str = "", fresh: bool = False) -> None:
    """Puts the screen into the chat's one message: edits it, or sends a new one when it is gone."""
    if note:
        text = text + "\n\n" + note
    ui = get_ui(chat)
    msg = ui.get("msg")
    # A new banner.jpg replaces the cached picture: Telegram keeps the old one under its file id.
    try:
        sig = f"{os.path.getsize(BANNER)}:{int(os.path.getmtime(BANNER))}"
    except OSError:
        sig = ""
    with lock:
        state = load_state()
        if state.get("banner_sig") != sig:
            state.pop("banner_id", None)
            state["banner_sig"] = sig
            save_state(state)
    if not load_state().get("banner_id"):
        # The banner's file id comes from a first upload as a photo; rich messages reuse it.
        try:
            res = tg_photo(chat, "…", {"inline_keyboard": []})
            quiet("deleteMessage", chat_id=chat, message_id=res.get("result", {}).get("message_id"))
        except (TgError, urllib.error.URLError, OSError, ValueError):
            pass
    body = rich_message(text)
    if msg and not fresh:
        try:
            tg("editMessageText", chat_id=chat, message_id=msg, rich_message=body, reply_markup=markup)
            return
        except TgError as err:
            if "not modified" in str(err):
                return
            if "BUTTON_URL" in str(err) and without_links(markup) != markup:
                show(chat, text, without_links(markup))  # Telegram refused an address: show the rest
                return
            # An older photo message cannot become a rich one: a new message replaces it below.
        except (urllib.error.URLError, OSError, ValueError):
            return
    try:
        res = tg("sendRichMessage", chat_id=chat, rich_message=body, reply_markup=markup)
    except (TgError, urllib.error.URLError, OSError, ValueError) as err:
        print("show failed:", err, file=sys.stderr)
        return
    new = res.get("result", {}).get("message_id")
    if new:
        if msg:
            quiet("deleteMessage", chat_id=chat, message_id=msg)
        set_ui(chat, msg=new)


def render(chat: int, screen: str, note: str = "", fresh: bool = False) -> None:
    ui = get_ui(chat)
    parts = screen.split(":")
    name = parts[0]
    if name == "home":
        text, markup = screen_home(ui)
    elif name == "add":
        text, markup = screen_add()
    elif name == "ch":
        text, markup = screen_channels(int(parts[1]) if len(parts) > 1 else 0)
    elif name == "c":
        text, markup = screen_channel(parts[1], int(parts[2]))
    elif name == "cd":
        text, markup = screen_channel_delete(parts[1], int(parts[2]))
    elif name == "ct":
        text, markup = screen_channel_tvg(parts[1])
    elif name == "src":
        text, markup = screen_sources()
    elif name == "s":
        text, markup = screen_source(parts[1])
    elif name == "sd":
        text, markup = screen_source_delete(parts[1])
    elif name == "epg":
        text, markup = screen_epg()
    elif name == "ga":
        text, markup = screen_epg_add()
    elif name == "g":
        text, markup = screen_epg_item(parts[1])
    elif name.startswith("wipe") and name[4:].isdigit():
        text, markup = screen_wipe(int(name[4:]))
    else:
        text, markup = screen_home(ui)
        screen = "home"
    waits = {"add": "source", "ct": "tvg:" + (parts[1] if len(parts) > 1 else ""), "ga": "epg", "epg": "epg", "g": "epg"}
    set_ui(chat, screen=screen, wait=waits.get(name, "source" if name in ("home", "src") else ""))
    show(chat, text, markup, note, fresh)


def done(text: str) -> str:
    return f"{e('🥳')} <b>{text}</b>"


def failed(text: str) -> str:
    return f"{e('😢')} <b>{text}</b>"


def in_background(chat: int, work, after: str) -> None:
    """Runs a slow job off the bot's thread; the message says so meanwhile and shows the result."""
    def run():
        try:
            note = work()
        except Exception as err:  # the message must not stay on "working"
            print("job failed:", err, file=sys.stderr)
            note = failed("Не получилось, попробуй ещё раз")
        render(chat, after, note)
    threading.Thread(target=run, daemon=True).start()


def token_warning(counts: dict) -> str:
    """Most of a new source's addresses failing at once is the mark of a provider that hands out
    one-time links: each one carries a token minted for whoever fetched the playlist and expires soon.
    Fetched here on the server, the viewer gets links that are already dead."""
    if counts["checked"] < 5 or counts["failed"] * 2 <= counts["checked"]:
        return ""
    return ("\n" + failed(f"Не отвечают {counts['failed']} из {counts['checked']}") +
            "\n<blockquote>Похоже, плейлист выдаёт одноразовые ссылки с токеном: они работают только на том "
            "устройстве, которое само скачало плейлист. Такой плейлист добавляйте прямо в приложении, "
            "через бота он работать не будет.</blockquote>")


def checked_note(counts: dict) -> str:
    s = summary()
    return done(f"Проверено {counts['checked']}, работают {s['working']} из {s['channels']}")


def add_from_text(chat: int, text: str) -> None:
    urls = [u for u in re.findall(r"https?://\S+", text)]
    if not urls:
        render(chat, "add", failed("Это не ссылка. Пришли файл или ссылку на плейлист"))
        return
    render(chat, "home", f"{e('⚡️')} <i>Скачиваю {plural(len(urls), 'ссылку', 'ссылки', 'ссылок')}…</i>")

    def work():
        total, bad = 0, 0
        for u in urls:
            try:
                name = urllib.parse.urlparse(u).netloc + urllib.parse.urlparse(u).path
                n = add_source(download(u), "url", short(name, 60), u)
            except (urllib.error.URLError, OSError, ValueError):
                n = 0
            if n:
                total += n
            else:
                bad += 1
        if not total:
            return failed("По ссылке нет плейлиста")
        counts = check_round(force="new")
        note = done(f"Добавлено {channels_word(total)}, проверено {counts['checked']}")
        if bad:
            note += "\n" + failed(f"Не скачалось: {bad}")
        return note + token_warning(counts)
    in_background(chat, work, "home")


def add_from_file(chat: int, doc: dict) -> None:
    if doc.get("file_size", 0) > MAX_FILE_BYTES:
        render(chat, "add", failed("Файл больше 20 МБ"))
        return
    render(chat, "home", f"{e('⚡️')} <i>Читаю файл…</i>")

    def work():
        path = tg("getFile", file_id=doc["file_id"])["result"]["file_path"]
        with urllib.request.urlopen(f"{API}/file/bot{TOKEN}/{path}", timeout=60) as r:
            raw = r.read(MAX_FILE_BYTES + 1)
        n = add_source(raw.decode("utf-8", "replace"), "file", doc.get("file_name") or "playlist.m3u8")
        if not n:
            return failed("В файле нет каналов")
        counts = check_round(force="new")
        return done(f"Добавлено {channels_word(n)}, проверено {counts['checked']}") + token_warning(counts)
    in_background(chat, work, "home")


def handle_message(msg: dict) -> None:
    chat = msg["chat"]["id"]
    if msg["chat"].get("type") != "private":
        return
    # The chat keeps only the bot's one message: what was sent is read and removed.
    quiet("deleteMessage", chat_id=chat, message_id=msg["message_id"])
    first = msg.get("from", {}).get("first_name", "")
    text = (msg.get("text") or "").strip()
    if try_link(chat, text, first):
        return
    admin = msg.get("from", {}).get("id") in ADMINS
    wait = get_ui(chat).get("wait", "")
    if not admin:
        # Viewers get the remote only.
        if not (text and not text.startswith("/") and remote_text(chat, text, wait)):
            render_remote(chat, "r", fresh=text.startswith("/"))
        return
    if first:
        set_ui(chat, first=first)
    doc = msg.get("document")
    if text and not text.startswith("/") and remote_text(chat, text, wait):
        return
    if text.startswith("/"):
        if remote.active(chat)[0] is not None:
            render_remote(chat, "r", fresh=True)
        else:
            render(chat, "home", fresh=True)
    elif doc and wait != "epg":
        add_from_file(chat, doc)
    elif wait.startswith("tvg:") and text:
        cid = wait[4:]
        _, c = find_channel(cid)
        if c is None:
            render(chat, "ch:0")
            return
        with lock:
            state = load_state()
            if text == "-":
                state["overrides"].pop(c.key, None)
            else:
                state["overrides"][c.key] = {"tvg-id": text[:100]}
            build_output(merged_channels(state), state)
            save_state(state)
        render(chat, f"c:{cid}:0", done("Телегид канала обновлён"))
    elif wait == "epg" and (text or doc):
        urls = re.findall(r"https?://\S+", text)
        if not urls or doc:
            render(chat, "ga", failed("Нужна ссылка на телегид"))
            return
        with lock:
            state = load_state()
            for u in urls:
                if u not in state["epg"]:
                    state["epg"].append(u)
            build_output(merged_channels(state), state)
            save_state(state)
        render(chat, "epg", done(f"Телегид добавлен: {len(urls)}"))
    elif text:
        add_from_text(chat, text)


def handle_callback(cb: dict) -> None:
    chat = cb.get("message", {}).get("chat", {}).get("id")
    if chat is None:
        quiet("answerCallbackQuery", callback_query_id=cb["id"])
        return
    data = cb.get("data") or "home"
    msg_id = cb["message"]["message_id"]
    if data.startswith("k:"):
        # A remote key: as quick as possible, nothing else read or written.
        remote_callback(chat, cb, data)
        return
    if get_ui(chat).get("msg") != msg_id:
        set_ui(chat, msg=msg_id)  # a button on an older copy of the message takes it over
    if data.split(":")[0] in ("r", "rp", "rg", "rpl", "rgl", "rpi", "rgi", "rpa", "rga", "rgr", "rpx", "rgx", "rpu",
                              "rc", "rcl", "rci", "rcp", "rcx", "rt", "rtd", "rtp", "rta", "rtx", "rtxa"):
        remote_callback(chat, cb, data)
        return
    if cb.get("from", {}).get("id") not in ADMINS:
        quiet("answerCallbackQuery", callback_query_id=cb["id"])
        render_remote(chat, "r")
        return
    toast = None
    parts = data.split(":")
    act = parts[0]
    if act == "chk":
        quiet("answerCallbackQuery", callback_query_id=cb["id"], text="Проверяю все каналы")
        render(chat, "home", f"{e('⚡️')} <i>Обновляю источники и проверяю каналы…</i>")

        def work():
            refresh_due_sources(force=True)
            return checked_note(check_round(force="all"))
        in_background(chat, work, "home")
        return
    if act == "cc":
        quiet("answerCallbackQuery", callback_query_id=cb["id"], text="Проверяю")
        cid, page = parts[1], parts[2]

        def work():
            _, c = find_channel(cid)
            if c is None:
                return ""
            check_urls(c.urls, manual=True)
            _, c = find_channel(cid)
            with lock:
                state = load_state()
            st = channel_status(state, c) if c else "wait"
            return done("Работает") if st == "ok" else failed("Не отвечает")
        in_background(chat, work, f"c:{cid}:{page}")
        return
    if act == "cx":
        _, c = find_channel(parts[1])
        if c:
            with lock:
                state = load_state()
                if c.key not in state["removed"]:
                    state["removed"].append(c.key)
                state["overrides"].pop(c.key, None)
                build_output(merged_channels(state), state)
                save_state(state)
            toast = "Канал удалён"
        render(chat, f"ch:{parts[2]}", done("Канал удалён") if c else "")
    elif act == "sr":
        quiet("answerCallbackQuery", callback_query_id=cb["id"], text="Скачиваю")
        sid = parts[1]
        n, _ = find_source(sid)

        def work():
            got = refresh_source(n) if n else -1
            if got <= 0:
                return failed("Не скачалось")
            counts = check_round(force="new")
            return done(f"Обновлено: {channels_word(got)}, новых проверено {counts['checked']}")
        in_background(chat, work, f"s:{sid}")
        return
    elif act == "sx":
        n, _ = find_source(parts[1])
        if n:
            remove_source(n)
        toast = "Источник удалён"
        render(chat, "src", done("Источник удалён"))
    elif act == "gm":
        u = find_epg(parts[1])
        if u:
            with lock:
                state = load_state()
                state["epg"] = [u]
                build_output(merged_channels(state), state)
                save_state(state)
        render(chat, "epg", done("Единый телегид для всех каналов"))
    elif act == "gd":
        u = find_epg(parts[1])
        with lock:
            state = load_state()
            state["epg"] = [x for x in state["epg"] if x != u]
            build_output(merged_channels(state), state)
            save_state(state)
        render(chat, "epg", done("Телегид удалён"))
    elif act == "wipex":
        with lock:
            state = load_state()
            for n in source_files(state):
                try:
                    os.remove(os.path.join(FILES, n))
                except OSError:
                    pass
            state.update({"sources": {}, "removed": [], "overrides": {}, "urls": {}, "order": []})
            build_output([], state)
            save_state(state)
        toast = "Всё удалено"
        render(chat, "home", done("Плейлист очищен"))
    else:
        render(chat, data)
    quiet("answerCallbackQuery", callback_query_id=cb["id"], text=toast)


# ---------------------------------------------------------------------------------------------
# Telegram: remote for a linked TV
# ---------------------------------------------------------------------------------------------

# callback key -> what the TV presses
KEYS = {"u": "up", "d": "down", "l": "left", "r": "right", "o": "ok", "b": "back", "h": "home",
        "cu": "ch_up", "cd": "ch_down", "rw": "rewind", "ff": "forward", "pp": "play_pause", "m": "menu",
        "vu": "vol_up", "vd": "vol_down", "mu": "mute"}
REMOTE_PAGE = 8
TV_ERRORS = {"bad_url": "Нужна ссылка", "not_found": "На телевизоре такого нет", "failed": "Телевизор не смог выполнить",
             "unknown": "Телевизор не знает этой команды, обновите SkMate"}


def no_tv_text() -> str:
    return (f"<b>Пульт SkMate</b>\n\n"
            f"<blockquote>На телевизоре откройте <b>SkMate → Настройки → Пульт через Telegram</b> "
            f"и пришлите сюда код с экрана.</blockquote>")


def screen_remote(chat: int) -> tuple[str, dict]:
    did, d = remote.active(chat)
    if did is None:
        return no_tv_text(), kb(*([back()] if chat in ADMINS else []))
    state = "в сети" if remote.online(d) else "не в сети"
    text = (f"<b>{h(d.get('name', 'TV'))}</b> · {state}\n\n"
            f"<blockquote>Кнопки работают как пульт. Пришлите <b>номер</b> канала, чтобы включить его, "
            f"или <b>название</b>, чтобы найти.</blockquote>")
    rows = [
        [btn("⏮ Канал", "k:cd"), btn("▲", "k:u"), btn("Канал ⏭", "k:cu")],
        [btn("◀", "k:l"), btn("OK", "k:o", style="primary"), btn("▶", "k:r")],
        [btn("⏪ Назад", "k:rw"), btn("▼", "k:d"), btn("Вперёд ⏩", "k:ff")],
        [btn("🔉", "k:vd"), btn("🔇", "k:mu"), btn("🔊", "k:vu")],
        [btn("↩ Назад", "k:b"), btn("⏯", "k:pp"), btn("Меню", "k:m"), btn("⌂ Домой", "k:h")],
        [btn("Плейлисты", "rp", "sources"), btn("Телегид", "rg", "guide")],
        [btn("Каналы", "rc", "channels"), btn("Телевизоры", "rt", "channels")],
    ]
    if chat in ADMINS:
        rows.append([btn("Плейлист SkMate", "home", "main")])
    return text, kb(*rows)


def tv_call(chat: int, ctype: str, args: dict | None = None):
    """The TV's answer, or a note saying why there is none."""
    r = remote.send(chat, ctype, args, wait=True)
    if r is False:
        return None, failed("Телевизор не подключён")
    if r is None:
        return None, failed("Телевизор не ответил. Он включён и SkMate открыт?")
    if isinstance(r, dict) and r.get("error"):
        return None, failed(TV_ERRORS.get(str(r["error"]), "Телевизор не смог выполнить"))
    return r, ""


def screen_remote_list(chat: int, kind: str, ui: dict) -> tuple[str, dict]:
    """Playlists ('p') or guides ('g') as the TV answered them last (kept in ui so paging needs no call)."""
    items = ui.get(f"r{kind}_items") or []
    title = "Плейлисты" if kind == "p" else "Телегид"
    lines = [f"{e('📂' if kind == 'p' else '📅')} <b>{title} на телевизоре</b>\n"]
    if not items:
        lines.append("<blockquote>Пусто</blockquote>")
    rows = []
    for i, it in enumerate(items[:20]):
        label = short(it.get("name") or it.get("url") or "—", 40)
        extra = f" · {it['channels']} кан." if it.get("channels") is not None else ""
        rows.append([btn(label + extra, f"r{kind}i:{i}")])
    rows.append([btn("Добавить", f"r{kind}a", "add", "success"), btn("Обновить", f"r{kind}", "refresh")])
    rows.append(back("r"))
    return "\n".join(lines), kb(*rows)


def screen_remote_item(chat: int, kind: str, i: int, ui: dict) -> tuple[str, dict]:
    items = ui.get(f"r{kind}_items") or []
    if i >= len(items):
        return screen_remote_list(chat, kind, ui)
    it = items[i]
    text = (f"{e('📂' if kind == 'p' else '📅')} <b>{h(it.get('name') or 'Без названия')}</b>\n\n"
            f"<blockquote><code>{h(short(it.get('url', ''), 300))}</code></blockquote>")
    rows = []
    if kind == "p":
        rows.append([btn("Обновить", f"rpu:{i}", "refresh")])
    else:
        rows.append([btn("Заменить", f"rgr:{i}", "refresh")])
    rows.append([btn("Удалить", f"r{kind}x:{i}", "delete", "danger")])
    rows.append(back(f"r{kind}l"))
    return text, kb(*rows)


def screen_remote_add(kind: str, replace: int = -1) -> tuple[str, dict]:
    what = "плейлист" if kind == "p" else "телегид"
    verb = "заменить" if replace >= 0 else "добавить"
    text = (f"{e('➕')} <b>{verb.capitalize()} {what}</b>\n\n"
            f"<blockquote>Пришлите ссылку, телевизор {verb} {what} сам, с теми же ограничениями, что и в настройках.</blockquote>")
    return text, kb(back(f"r{kind}l"))


def screen_remote_channels(ui: dict) -> tuple[str, dict]:
    items = ui.get("rc_items") or []
    q = ui.get("rc_q", "")
    head = f"<b>Каналы</b>\n\n"
    if not q:
        return head + "<blockquote>Пришлите название канала или его номер</blockquote>", kb(back("r"))
    head += f"<blockquote>Поиск: <b>{h(q)}</b>, найдено {len(items)}</blockquote>"
    rows = [[btn(short(f"{it.get('number') or ''} {it.get('name', '')}".strip(), 40), f"rci:{i}")] for i, it in enumerate(items[:REMOTE_PAGE * 2])]
    rows.append(back("r"))
    return head, kb(*rows)


def screen_remote_channel(i: int, ui: dict) -> tuple[str, dict]:
    items = ui.get("rc_items") or []
    if i >= len(items):
        return screen_remote_channels(ui)
    it = items[i]
    text = f"<b>{h(it.get('name', ''))}</b>" + (f"\nНомер {it['number']}" if it.get("number") else "")
    return text, kb([btn("Включить", f"rcp:{i}", style="success")],
                    [btn("Скрыть канал", f"rcx:{i}", "delete", "danger")], back("rcl"))


def screen_remote_tvs(chat: int) -> tuple[str, dict]:
    did, _ = remote.active(chat)
    rows = []
    lines = [f"<b>Телевизоры</b>\n"]
    for k, v in remote.devices_of(chat):
        mark = "● " if k == did else ""
        lines.append(f"• {mark}{h(v.get('name', 'TV'))} · {'в сети' if remote.online(v) else 'не в сети'}")
        rows.append([btn(("✓ " if k == did else "") + short(v.get("name", "TV"), 40), f"rtd:{k[:40]}", "channels")])
    lines.append("\n<blockquote>Чтобы добавить телевизор, пришлите код с его экрана.</blockquote>")
    if did is not None:
        rows.append([btn("Отвязать все", "rtxa", "cancel", "danger")])
    rows.append(back("r"))
    return "\n".join(lines), kb(*rows)


def screen_remote_tv(chat: int, prefix: str) -> tuple[str, dict]:
    """One TV: only what can be done with it as a device, the unlink and Back at the very bottom."""
    for k, v in remote.devices_of(chat):
        if k.startswith(prefix):
            text = (f"<b>{h(v.get('name', 'TV'))}</b> · {'в сети' if remote.online(v) else 'не в сети'}\n\n"
                    f"<blockquote>Закрыть SkMate на телевизоре или отвязать его от этого аккаунта.</blockquote>")
            return text, kb([btn("Закрыть SkMate", f"rtp:{k[:40]}", "cancel")],
                            [btn("Отвязать", f"rtx:{k[:40]}", "cancel", "danger")], back("rt"))
    return screen_remote_tvs(chat)


def render_remote(chat: int, screen: str, note: str = "", fresh: bool = False) -> bool:
    """Draws a remote screen; False when [screen] is not one."""
    ui = get_ui(chat)
    p = screen.split(":")
    n = p[0]
    wait = "remote"
    if n == "r":
        text, markup = screen_remote(chat)
    elif n in ("rpl", "rgl"):
        text, markup = screen_remote_list(chat, n[1], ui)
    elif n in ("rpi", "rgi"):
        text, markup = screen_remote_item(chat, n[1], int(p[1]), ui)
    elif n in ("rpa", "rga"):
        text, markup = screen_remote_add(n[1])
        wait = n
    elif n == "rgr":
        text, markup = screen_remote_add("g", int(p[1]))
        wait = "rgr:" + p[1]
    elif n == "rcl":
        text, markup = screen_remote_channels(ui)
    elif n == "rci":
        text, markup = screen_remote_channel(int(p[1]), ui)
    elif n == "rt":
        text, markup = screen_remote_tvs(chat)
    elif n == "rtd":
        text, markup = screen_remote_tv(chat, p[1])
    else:
        return False
    set_ui(chat, screen=screen, wait=wait)
    show(chat, text, markup, note, fresh)
    return True


def remote_fetch(chat: int, kind: str) -> None:
    """Asks the TV for its playlists / guides and shows them."""
    def work():
        r, err = tv_call(chat, "sources.list" if kind == "p" else "epg.list")
        if err:
            return err
        set_ui(chat, **{f"r{kind}_items": (r or {}).get("items", [])[:20]})
        return ""
    render_remote(chat, "r", f"{e('⚡️')} Спрашиваю телевизор…")
    threading.Thread(target=lambda: _after(chat, work, f"r{kind}l"), daemon=True).start()


def _after(chat: int, work, screen: str) -> None:
    try:
        note = work()
    except Exception as err:  # the message must not stay on "working"
        print("remote job failed:", err, file=sys.stderr)
        note = failed("Не получилось, попробуйте ещё раз")
    render_remote(chat, screen, note)


def remote_action(chat: int, ctype: str, args: dict, after: str, ok_text: str, refetch: str = "") -> None:
    def work():
        r, err = tv_call(chat, ctype, args)
        if err:
            return err
        if refetch:
            r2, _ = tv_call(chat, "sources.list" if refetch == "p" else "epg.list")
            if r2 is not None:
                set_ui(chat, **{f"r{refetch}_items": r2.get("items", [])[:20]})
        msg = (r or {}).get("message") if isinstance(r, dict) else None
        return done(msg or ok_text)
    render_remote(chat, after, f"{e('⚡️')} Телевизор выполняет…")
    threading.Thread(target=lambda: _after(chat, work, after), daemon=True).start()


def remote_text(chat: int, text: str, wait: str) -> bool:
    """A message while a remote screen is open. True when handled."""
    if wait in ("rpa", "rga") or wait.startswith("rgr:"):
        urls = re.findall(r"https?://\S+", text)
        if not urls:
            render_remote(chat, wait if ":" not in wait else wait, failed("Нужна ссылка"))
            return True
        if wait == "rpa":
            remote_action(chat, "sources.add", {"url": urls[0]}, "rpl", "Плейлист добавлен", "p")
        elif wait == "rga":
            remote_action(chat, "epg.add", {"url": urls[0]}, "rgl", "Телегид добавлен", "g")
        else:
            items = get_ui(chat).get("rg_items") or []
            i = int(wait[4:])
            if i < len(items):
                remote_action(chat, "epg.replace", {"id": items[i].get("id"), "url": urls[0]}, "rgl", "Телегид заменён", "g")
        return True
    if wait != "remote":
        return False
    digits = text.replace(" ", "")
    if digits.isdigit() and len(digits) <= 5:
        r = remote.send(chat, "play", {"number": int(digits)})
        render_remote(chat, "r", done(f"Включаю канал {digits}") if r else failed("Телевизор не подключён"))
        return True

    def work():
        r, err = tv_call(chat, "channels.search", {"q": text[:60]})
        if err:
            return err
        set_ui(chat, rc_items=(r or {}).get("items", [])[:REMOTE_PAGE * 2], rc_q=text[:60])
        return ""
    render_remote(chat, "r", f"{e('⚡️')} Ищу «{h(short(text, 30))}»…")
    threading.Thread(target=lambda: _after(chat, work, "rcl"), daemon=True).start()
    return True


def remote_callback(chat: int, cb: dict, data: str) -> bool:
    """A button of the remote. True when handled (callback answered here)."""
    p = data.split(":")
    a = p[0]
    cbid = cb["id"]
    if a == "k":
        # A key: no redraw, just a quick tick, so presses feel like a remote.
        r = remote.send(chat, "key", {"key": KEYS.get(p[1], "")})
        quiet("answerCallbackQuery", callback_query_id=cbid, text=None if r else "Телевизор не подключён")
        return True
    ui = get_ui(chat)
    quiet("answerCallbackQuery", callback_query_id=cbid)
    if a in ("rp", "rg"):
        remote_fetch(chat, a[1])
    elif a in ("rpx", "rgx", "rpu"):
        kind = a[1]
        items = ui.get(f"r{kind}_items") or []
        i = int(p[1])
        if i < len(items):
            it = items[i]
            if a == "rpx":
                remote_action(chat, "sources.delete", {"id": it.get("id")}, "rpl", "Плейлист удалён", "p")
            elif a == "rpu":
                remote_action(chat, "sources.refresh", {"id": it.get("id")}, "rpl", "Плейлист обновляется", "p")
            else:
                remote_action(chat, "epg.delete", {"id": it.get("id")}, "rgl", "Телегид удалён", "g")
    elif a == "rc":
        set_ui(chat, rc_items=[], rc_q="")
        render_remote(chat, "rcl")
    elif a in ("rcp", "rcx"):
        items = ui.get("rc_items") or []
        i = int(p[1])
        if i < len(items):
            if a == "rcp":
                remote.send(chat, "play", {"id": items[i].get("id")})
                render_remote(chat, "r", done(f"Включаю {h(items[i].get('name', ''))}"))
            else:
                remote_action(chat, "channels.hide", {"id": items[i].get("id")}, "r", "Канал скрыт")
    elif a == "rta":
        for k, _ in remote.devices_of(chat):
            if k.startswith(p[1]):
                remote.set_active(chat, k)
        render_remote(chat, "rt")
    elif a == "rtp":
        for k, _ in remote.devices_of(chat):
            if k.startswith(p[1]):
                remote.set_active(chat, k)
                remote.send(chat, "key", {"key": "power"})
        render_remote(chat, "rt", done("SkMate на телевизоре закрывается"))
    elif a == "rtxa":
        for k, _ in remote.devices_of(chat):
            remote.unlink_from_chat(chat, k)
        render_remote(chat, "r", done("Все телевизоры отвязаны"))
    elif a == "rtx":
        for k, _ in remote.devices_of(chat):
            if k.startswith(p[1]):
                remote.unlink_from_chat(chat, k)
        render_remote(chat, "rt", done("Телевизор отвязан"))
    elif not render_remote(chat, data):
        return False
    return True


def try_link(chat: int, text: str, first: str) -> bool:
    """A pairing code (6 digits, or /start tv123456). True when it was one."""
    m = re.fullmatch(r"(?:/start\s+tv)?\s*(\d{3}\s?\d{3})\s*", text)
    if not m:
        return False
    r = remote.link(chat, m.group(1), first)
    if r.startswith("ok:"):
        render_remote(chat, "r", done(f"Подключён: {h(r[3:])}"), fresh=True)
    elif r == "full":
        render_remote(chat, "rt", failed(f"Не больше {remote.MAX_DEVICES_PER_CHAT} телевизоров"))
    elif r == "locked":
        render_remote(chat, "r", failed("Слишком много неверных кодов, попробуйте через 15 минут"))
    else:
        render_remote(chat, "r", failed("Код не подходит или устарел. Откройте пульт на телевизоре ещё раз"))
    return True


def bot_loop() -> None:
    quiet("setMyCommands", commands=[{"command": "start", "description": "Меню"}])
    offset = 0
    while True:
        try:
            updates = tg("getUpdates", offset=offset, timeout=60, allowed_updates=["message", "callback_query"]).get("result", [])
        except (TgError, urllib.error.URLError, OSError, ValueError) as err:
            print("poll failed:", err, file=sys.stderr)
            time.sleep(10)
            continue
        for u in updates:
            offset = u["update_id"] + 1
            try:
                if u.get("message"):
                    handle_message(u["message"])
                elif u.get("callback_query"):
                    handle_callback(u["callback_query"])
            except Exception as err:  # one bad update must not stop the bot
                print("handle failed:", err, file=sys.stderr)


def daily_report(last_day: list) -> None:
    """Once a day, at 9:00: the one message shows fresh numbers, and a short note that replaces
    yesterday's gives the notification."""
    day = time.strftime("%Y-%m-%d")
    if not (TOKEN and ADMINS) or time.strftime("%H") != "09" or last_day[0] == day:
        return
    last_day[0] = day
    s = summary()
    for a in ADMINS:
        ui = get_ui(a)
        if ui.get("report"):
            quiet("deleteMessage", chat_id=a, message_id=ui["report"])
        text = (f"{e('☕️')} <b>Плейлист за сутки</b>\n"
                f"<blockquote>Работают {s['working']} из {s['channels']}, не работают {s['off']}</blockquote>")
        try:
            res = tg("sendMessage", chat_id=a, text=text, parse_mode="HTML")
            set_ui(a, report=res.get("result", {}).get("message_id"))
        except (TgError, urllib.error.URLError, OSError, ValueError):
            pass
        if ui.get("msg") and ui.get("screen", "home") == "home":
            render(a, "home")


def checker_loop() -> None:
    last_day = [""]
    while True:
        try:
            refresh_due_sources()
            counts = check_round()
            if counts["died"] or counts["revived"]:
                print(f"checked {counts['checked']}, died {counts['died']}, revived {counts['revived']}", flush=True)
            daily_report(last_day)
        except Exception as err:  # keep checking whatever one round threw
            print("check round failed:", err, file=sys.stderr)
        time.sleep(60)


def main() -> None:
    os.makedirs(FILES, exist_ok=True)
    remote.init(DATA)
    rebuild()
    threading.Thread(target=checker_loop, daemon=True).start()
    if TOKEN:
        threading.Thread(target=bot_loop, daemon=True).start()
    else:
        print("bot off: no token or admins yet", flush=True)
    serve()


if __name__ == "__main__":
    main()
