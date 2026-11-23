"""SkMate remote: a TV linked to a Telegram account and driven from the bot like a remote.

The TV asks the service for a pairing code, the viewer sends that code to the bot, and from then on
the bot's buttons become commands that the TV picks up over a held HTTP request (answered the moment
a command arrives). Lists (playlists, guides, channels) come from the TV itself and every change is
made by the TV with its own code, so the TV's limits apply as they are.

State lives in DATA/remote.json:
  devices: {device_id: {secret_hash, name, owner (chat id or null), linked_at, seen}}
  codes:   {code: {device, until}}
  chats:   {chat id: {active: device_id}}

HTTP (behind nginx at /skmate/tv/):
  POST /tv/register   {"device", "name"}             -> {"code", "secret", "until"}  (new or same device)
  POST /tv/code       {"device", "secret"}           -> {"code", "until"}           (a fresh code)
  GET  /tv/poll  (headers X-Device, X-Secret)        -> {"linked", "owner", "cmds": [...]}  (held up to 25 s)
  POST /tv/reply      {"device", "secret", "id", "result"}
  POST /tv/unlink     {"device", "secret"}
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import threading
import time

POLL_HOLD = 25            # seconds a poll is held open when there is nothing to send
CODE_TTL = 10 * 60        # a pairing code lives this long
CMD_TTL = 30              # a command not picked up in this time is dropped (a key press goes stale)
REPLY_WAIT = 15           # seconds the bot waits for the TV's answer
MAX_DEVICES_PER_CHAT = 5
MAX_BAD_CODES = 5         # wrong codes from one chat before it is locked out
LOCKOUT = 15 * 60         # seconds of lockout; failures also count down over this time
GLOBAL_BAD_CODES = 60     # wrong codes from everyone within LOCKOUT: pairing is paused for all

_lock = threading.Lock()
_wake = threading.Condition(_lock)
_queues: dict[str, list[dict]] = {}       # device -> pending commands (memory only: stale after a restart)
_replies: dict[str, dict] = {}            # command id -> result
_path = ""
_bad: dict[int, list[float]] = {}   # chat -> times of its wrong codes
_bad_all: list[float] = []


def init(data_dir: str) -> None:
    global _path
    _path = os.path.join(data_dir, "remote.json")


def _load() -> dict:
    try:
        with open(_path, encoding="utf-8") as f:
            s = json.load(f)
    except (OSError, ValueError):
        s = {}
    s.setdefault("devices", {})
    s.setdefault("codes", {})
    s.setdefault("chats", {})
    return s


def _save(s: dict) -> None:
    tmp = _path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(s, f, ensure_ascii=False)
    os.replace(tmp, _path)


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def _new_code(s: dict, device: str) -> tuple[str, float]:
    now = time.time()
    s["codes"] = {c: v for c, v in s["codes"].items() if v["until"] > now and v["device"] != device}
    while True:
        code = f"{secrets.randbelow(900000) + 100000}"
        if code not in s["codes"]:
            break
    until = now + CODE_TTL
    s["codes"][code] = {"device": device, "until": until}
    return code, until


def _auth(s: dict, device: str, secret: str) -> dict | None:
    d = s["devices"].get(device or "")
    if d and secret and secrets.compare_digest(d["secret_hash"], _hash(secret)):
        return d
    return None


# ---------------------------------------------------------------------------------------------
# TV side
# ---------------------------------------------------------------------------------------------

def register(device: str, name: str, secret: str = "") -> dict:
    """A new TV, or one that lost its secret: a fresh secret and a code. A known TV with its secret
    keeps its link."""
    device = (device or "")[:64]
    if len(device) < 8:
        raise ValueError("device")
    with _lock:
        s = _load()
        d = _auth(s, device, secret)
        if d is None:
            secret = secrets.token_urlsafe(24)
            d = {"secret_hash": _hash(secret), "owner": None, "linked_at": 0}
            s["devices"][device] = d
        d["name"] = (name or "TV")[:60]
        d["seen"] = time.time()
        code, until = _new_code(s, device)
        _save(s)
    return {"code": code, "secret": secret, "until": until, "linked": d.get("owner") is not None}


def new_code(device: str, secret: str) -> dict | None:
    with _lock:
        s = _load()
        if _auth(s, device, secret) is None:
            return None
        code, until = _new_code(s, device)
        _save(s)
    return {"code": code, "until": until}


def poll(device: str, secret: str) -> dict | None:
    """Held until a command comes or POLL_HOLD runs out."""
    deadline = time.time() + POLL_HOLD
    with _wake:
        s = _load()
        d = _auth(s, device, secret)
        if d is None:
            return None
        d["seen"] = time.time()
        _save(s)
        owner = d.get("owner")
        while True:
            now = time.time()
            q = [c for c in _queues.get(device, []) if now - c["at"] < CMD_TTL]
            if q or now >= deadline:
                _queues[device] = []
                return {"linked": owner is not None, "owner": d.get("owner_name", ""),
                        "cmds": [{"id": c["id"], "type": c["type"], "args": c["args"]} for c in q]}
            _wake.wait(deadline - now)
            # Unlinked meanwhile: say so at once.
            s = _load()
            d = s["devices"].get(device) or {}
            if d.get("owner") != owner:
                return {"linked": d.get("owner") is not None, "owner": d.get("owner_name", ""), "cmds": []}


def reply(device: str, secret: str, cid: str, result) -> bool:
    with _wake:
        if _auth(_load(), device, secret) is None:
            return False
        _replies[cid] = {"result": result, "at": time.time()}
        for k in [k for k, v in _replies.items() if time.time() - v["at"] > 120]:
            _replies.pop(k, None)
        _wake.notify_all()
    return True


def unlink_device(device: str, secret: str) -> bool:
    with _wake:
        s = _load()
        d = _auth(s, device, secret)
        if d is None:
            return False
        _drop_link(s, device)
        _save(s)
        _wake.notify_all()
    return True


# ---------------------------------------------------------------------------------------------
# Bot side
# ---------------------------------------------------------------------------------------------

def _drop_link(s: dict, device: str) -> None:
    d = s["devices"].get(device)
    if not d:
        return
    owner = d.get("owner")
    d["owner"] = None
    d.pop("owner_name", None)
    if owner is not None:
        chat = s["chats"].get(str(owner)) or {}
        if chat.get("active") == device:
            chat["active"] = next((k for k, v in s["devices"].items() if v.get("owner") == owner), None)


def link(chat: int, code: str, owner_name: str = "") -> str:
    """'ok:<tv name>', 'bad' (no such code), 'full' (too many TVs on this account), 'locked' (too many wrong codes)."""
    code = "".join(ch for ch in code if ch.isdigit())
    now = time.time()
    with _wake:
        mine = [t for t in _bad.get(chat, []) if now - t < LOCKOUT]
        _bad[chat] = mine
        _bad_all[:] = [t for t in _bad_all if now - t < LOCKOUT]
        if len(mine) >= MAX_BAD_CODES or len(_bad_all) >= GLOBAL_BAD_CODES:
            return "locked"
        s = _load()
        c = s["codes"].get(code)
        # A code only pairs a TV nobody owns yet: a linked TV is unlinked first, from the TV or its owner.
        if (not c or c["until"] < now or c["device"] not in s["devices"]
                or s["devices"][c["device"]].get("owner") not in (None, chat)):
            mine.append(now)
            _bad_all.append(now)
            return "bad"
        mine = [k for k, v in s["devices"].items() if v.get("owner") == chat and k != c["device"]]
        if len(mine) >= MAX_DEVICES_PER_CHAT:
            return "full"
        d = s["devices"][c["device"]]
        d["owner"] = chat
        d["owner_name"] = owner_name[:60]
        d["linked_at"] = time.time()
        s["codes"].pop(code, None)
        s["chats"].setdefault(str(chat), {})["active"] = c["device"]
        _save(s)
        _wake.notify_all()
        return "ok:" + d.get("name", "TV")


def devices_of(chat: int) -> list[tuple[str, dict]]:
    with _lock:
        s = _load()
    return [(k, v) for k, v in s["devices"].items() if v.get("owner") == chat]


def active(chat: int) -> tuple[str | None, dict | None]:
    with _lock:
        s = _load()
    did = (s["chats"].get(str(chat)) or {}).get("active")
    d = s["devices"].get(did or "")
    if d and d.get("owner") == chat:
        return did, d
    for k, v in s["devices"].items():
        if v.get("owner") == chat:
            return k, v
    return None, None


def set_active(chat: int, device: str) -> None:
    with _lock:
        s = _load()
        if (s["devices"].get(device) or {}).get("owner") == chat:
            s["chats"].setdefault(str(chat), {})["active"] = device
            _save(s)


def unlink_from_chat(chat: int, device: str) -> None:
    with _wake:
        s = _load()
        if (s["devices"].get(device) or {}).get("owner") == chat:
            _drop_link(s, device)
            _save(s)
        _wake.notify_all()


def online(d: dict | None) -> bool:
    return bool(d) and time.time() - d.get("seen", 0) < POLL_HOLD + 15


def send(chat: int, ctype: str, args: dict | None = None, wait: bool = False):
    """Queues a command for the chat's active TV. wait=True returns the TV's answer (None: no answer
    in REPLY_WAIT, False: no TV)."""
    did, d = active(chat)
    if did is None:
        return False
    cid = secrets.token_hex(6)
    with _wake:
        q = _queues.setdefault(did, [])
        # Key presses pile up when the TV is slow; keep the last few so it does not run on by itself.
        if ctype == "key" and sum(1 for c in q if c["type"] == "key") >= 6:
            return None
        q.append({"id": cid, "type": ctype, "args": args or {}, "at": time.time()})
        _wake.notify_all()
        if not wait:
            return True
        end = time.time() + REPLY_WAIT
        while cid not in _replies and time.time() < end:
            _wake.wait(end - time.time())
        r = _replies.pop(cid, None)
    return r["result"] if r else None
