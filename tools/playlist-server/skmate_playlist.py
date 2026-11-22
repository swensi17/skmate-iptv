#!/usr/bin/env python3
"""SkMate playlist service: the author's auto-updated playlist.

The author manages it from a Telegram bot: playlist files or links in, channels checked in the
background, only the working ones served at a single address that the app subscribes to. Only the
standard library is used.

Rules:
  - Channels with the same tvg-id (or, without one, the same normalised name) are one channel; every
    address they come with is kept as a fallback, newest source first.
  - An address is dropped only after FAIL_LIMIT failed checks in a row, each at least RETRY_GAP apart,
    so a short outage does not empty the list. A working fallback takes over meanwhile, in the same
    place and under the same number.
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
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
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

FAIL_LIMIT = 3                 # failed checks in a row before an address counts as dead
RETRY_GAP = 10 * 60            # seconds between checks of a failing address
ALIVE_EVERY = 6 * 3600         # a working address is checked again after this
DEAD_EVERY = 12 * 3600         # a dead address is tried again after this
SOURCE_EVERY = 6 * 3600        # a source added by link is downloaded again after this
WORKERS = 12                   # checks at once
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


def record(state: dict, url: str, ok: bool, now: float, manual: bool = False) -> str | None:
    """Stores a check; returns 'died' / 'revived' when the address changed side. A check the author
    asked for decides at once: it is what they look at."""
    info = state["urls"].setdefault(url, {})
    was_dead = info.get("dead", False)
    info["checked"] = now
    if ok:
        info["fails"] = 0
        info["dead"] = False
        info["ok_at"] = now
        return "revived" if was_dead else None
    info["fails"] = max(info.get("fails", 0) + 1, FAIL_LIMIT if manual else 0)
    if info["fails"] >= FAIL_LIMIT and not was_dead:
        info["dead"] = True
        return "died"
    return None


def check_urls(urls: list[str], manual: bool = False) -> dict:
    counts = {"checked": 0, "died": 0, "revived": 0, "failed": 0}
    if urls:
        with concurrent.futures.ThreadPoolExecutor(WORKERS) as pool:
            results = list(pool.map(lambda u: (u, check_url(u)), urls))
    else:
        results = []
    with lock:
        state = load_state()
        now = time.time()
        for u, ok in results:
            change = record(state, u, ok, now, manual)
            counts["checked"] += 1
            if not ok:
                counts["failed"] += 1
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
        build_output(merged_channels(state), state)
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
    # Not yet checked counts as usable, so a fresh source shows at once; a failing one keeps its
    # place until it is really dead.
    return not (info and info.get("dead"))


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


def e(ch: str) -> str:
    return f'<tg-emoji emoji-id="{EMOJI[ch]}">{ch}</tg-emoji>'


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


def show(chat: int, text: str, markup: dict, note: str = "", fresh: bool = False) -> None:
    """Puts the screen into the chat's one message: edits it, or sends a new one when it is gone."""
    if note:
        text = fit(text + "\n\n" + note)
    ui = get_ui(chat)
    msg = ui.get("msg")
    if msg and not fresh:
        try:
            tg("editMessageCaption", chat_id=chat, message_id=msg, caption=text, parse_mode="HTML", reply_markup=markup)
            return
        except TgError as err:
            if "not modified" in str(err):
                return
            if "BUTTON_URL" in str(err) and without_links(markup) != markup:
                show(chat, text, without_links(markup))  # Telegram refused an address: show the rest
                return
        except (urllib.error.URLError, OSError, ValueError):
            return
    try:
        res = tg_photo(chat, text, markup)
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
    if msg.get("from", {}).get("id") not in ADMINS or msg["chat"].get("type") != "private":
        return  # strangers get no answer at all
    # The chat keeps only the bot's one message: what the author sent is read and removed.
    quiet("deleteMessage", chat_id=chat, message_id=msg["message_id"])
    first = msg.get("from", {}).get("first_name", "")
    if first:
        set_ui(chat, first=first)
    text = (msg.get("text") or "").strip()
    doc = msg.get("document")
    wait = get_ui(chat).get("wait", "")
    if text.startswith("/"):
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
    if cb.get("from", {}).get("id") not in ADMINS or chat is None:
        quiet("answerCallbackQuery", callback_query_id=cb["id"])
        return
    data = cb.get("data") or "home"
    toast = None
    msg_id = cb["message"]["message_id"]
    if get_ui(chat).get("msg") != msg_id:
        set_ui(chat, msg=msg_id)  # a button on an older copy of the message takes it over
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
    rebuild()
    threading.Thread(target=checker_loop, daemon=True).start()
    if TOKEN and ADMINS:
        threading.Thread(target=bot_loop, daemon=True).start()
    else:
        print("bot off: no token or admins yet", flush=True)
    serve()


if __name__ == "__main__":
    main()
