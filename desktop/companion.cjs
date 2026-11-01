// "From another device" for the Windows app, after the Android app's companion server (core/companion): a small
// HTTP server on this computer's Wi-Fi address that a phone opens from a QR code. The QR carries the address only;
// the page asks for the 6-digit PIN shown on screen, ten wrong ones close the server. Two modes, as on Android:
//  - "add": a form for a playlist (M3U link or file, Xtream, Stalker) that is sent to the app;
//  - "sync": another SkMate on the same Wi-Fi sends this one its backup (POST /backup) or takes this one's (GET).
// Paths, field names and the PIN header are Android's, so the same requests work against either.
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");

const DEFAULT_PORT = 8089;
const MAX_PIN_ATTEMPTS = 10;
const FAILED_PIN_DELAY_MS = 500;
const UPLOAD_BODY_LIMIT = 16 * 1024 * 1024;
const FORM_BODY_LIMIT = 64 * 1024;

/** Same length and same characters, compared without stopping early, so timing says nothing about the PIN. */
function pinEquals(submitted, expected) {
  const a = String(submitted);
  const b = String(expected);
  if (a.length !== b.length || b.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseQuery(query) {
  const out = {};
  for (const pair of String(query).split("&")) {
    if (!pair) continue;
    const [k, v = ""] = pair.split(/=(.*)/s);
    const dec = (s) => { try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch { return s; } };
    const key = dec(k);
    if (key.trim()) out[key] = dec(v);
  }
  return out;
}

const maxBodyBytes = (path) => (path === "/backup" || path === "/m3u" ? UPLOAD_BODY_LIMIT : FORM_BODY_LIMIT);

/** One playlist sent from the page (form or JSON), or null when what its kind needs is missing. Android's rules. */
function parsePayload(contentType, body, fallbackType) {
  const isJson = /application\/json/i.test(contentType ?? "") || String(body).trimStart().startsWith("{");
  let fields = {};
  if (isJson) {
    try {
      const o = JSON.parse(body);
      for (const [k, v] of Object.entries(o ?? {})) if (v !== null && v !== undefined) fields[k] = String(v);
    } catch { fields = {}; }
  } else fields = parseQuery(body);
  const pick = (...keys) => keys.map((k) => fields[k]).find((v) => v && v.trim()) ?? "";
  const raw = (pick("type", "sourceType", "source_type") || fallbackType).trim().toLowerCase();
  const type = raw === "m3u" || raw === "m3u8" ? "m3u" : raw === "stalker" ? "stalker" : "xtream";
  const p = {
    type,
    name: pick("name").trim(),
    server: pick("server", "url").trim(),
    playlistContent: pick("playlistFile", "playlist_file"), // the file's own text: not trimmed
    playlistFileName: pick("playlistFileName", "playlist_file_name").trim(),
    user: pick("user", "username").trim(),
    pass: pick("pass", "password").trim(),
    portalUrl: pick("portalUrl", "portal_url").trim(),
    mac: pick("mac", "macAddress", "mac_address").trim(),
  };
  if (type === "stalker" && (!p.portalUrl || !p.mac)) return null;
  if (type === "m3u" && !p.server && !p.playlistContent.trim()) return null;
  if (type === "xtream" && (!p.server || !p.user || !p.pass)) return null;
  return p;
}

/** RFC 1918: 10/8, 192.168/16, 172.16–31/12. */
function isPrivateLan(host) {
  if (host.startsWith("10.") || host.startsWith("192.168.")) return true;
  const m = /^172\.(\d+)\./.exec(host);
  return Boolean(m && +m[1] >= 16 && +m[1] <= 31);
}

/** Addresses another device can open, the home Wi-Fi range first; loopback only when there is nothing else. */
function lanUrls(port, interfaces = os.networkInterfaces()) {
  const hosts = [];
  for (const list of Object.values(interfaces)) {
    for (const a of list ?? []) {
      if ((a.family === "IPv4" || a.family === 4) && !a.internal && !a.address.startsWith("169.254.")) hosts.push(a.address);
    }
  }
  const sorted = [...new Set(hosts)].sort((x, y) => Number(isPrivateLan(y)) - Number(isPrivateLan(x)));
  return (sorted.length ? sorted : ["127.0.0.1"]).map((h) => `http://${h}:${port}/`);
}

const newPin = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One page for a phone, in the app's language ([s] are the app's own strings) and its dark look. */
function page(s, title, body, lang) {
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#121212;color:#f1f2f3;font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:520px;margin:0 auto;padding:28px 16px 40px}h1{font-size:24px;margin:0 0 8px}p{color:#c6cacf;margin:0 0 18px}
label{display:block;font-size:14px;color:#c6cacf;margin:14px 0 6px}input{width:100%;padding:13px 14px;border-radius:12px;border:1px solid #3a3d41;background:#1d1f22;color:#f1f2f3;font-size:16px}
input[type=file]{padding:10px}.pin{font-size:28px;letter-spacing:10px;text-align:center}.seg{display:flex;gap:6px;background:#1d1f22;border-radius:12px;padding:4px;margin-bottom:6px}
.seg button{flex:1;border:0;border-radius:9px;padding:10px 6px;background:none;color:#c6cacf;font:inherit;font-size:14px}.seg button.on{background:#f1f2f3;color:#121212;font-weight:600}
.go{display:block;width:100%;margin-top:22px;padding:14px;border:0;border-radius:12px;background:#f1f2f3;color:#121212;font:inherit;font-weight:700;font-size:17px;text-decoration:none;text-align:center}
.err{color:#ff8a80;margin-top:12px}.kind{display:none}.kind.on{display:block}.brand{font-weight:700;color:#8a8f95;font-size:13px;letter-spacing:1px;margin-bottom:18px}
</style></head><body><main><div class="brand">SKMATE IPTV</div>${body}</main></body></html>`;
}

function gatePage(s, lang, error) {
  return page(s, s.pinPageTitle, `<h1>${esc(s.pinHeading)}</h1><p>${esc(s.pinDescription)}</p>
<form method="post" action="/"><input class="pin" name="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-label="PIN" autofocus>
${error ? `<div class="err">${esc(error)}</div>` : ""}<button class="go" type="submit">${esc(s.continue)}</button></form>`, lang);
}

function addPage(s, lang, pin, withStalker) {
  const kinds = [["m3u", s.kindM3u], ["xtream", s.kindXtream], ...(withStalker ? [["stalker", s.kindStalker]] : [])];
  const q = `?pin=${encodeURIComponent(pin)}`;
  return page(s, s.addPageTitle, `<h1>${esc(s.addHeading)}</h1>
<div class="seg">${kinds.map(([k, l], i) => `<button type="button" data-k="${k}" class="${i === 0 ? "on" : ""}">${esc(l)}</button>`).join("")}</div>
<form class="kind on" data-k="m3u" method="post" action="/m3u${q}"><label>${esc(s.m3uUrl)}</label><input name="server" inputmode="url" autocomplete="off" placeholder="http://">
<label>${esc(s.playlistFile)}</label><input type="file" accept=".m3u,.m3u8,.txt,audio/x-mpegurl"><input type="hidden" name="playlistFile"><input type="hidden" name="playlistFileName">
<div class="err" hidden>${esc(s.urlOrFile)}</div><button class="go" type="submit">${esc(s.sendToTv)}</button></form>
<form class="kind" data-k="xtream" method="post" action="/xtream${q}"><label>${esc(s.xtServer)}</label><input name="server" inputmode="url" autocomplete="off" placeholder="http://" required>
<label>${esc(s.xtUser)}</label><input name="user" autocomplete="off" required><label>${esc(s.xtPass)}</label><input name="pass" type="password" required>
<button class="go" type="submit">${esc(s.sendToTv)}</button></form>
${withStalker ? `<form class="kind" data-k="stalker" method="post" action="/stalker${q}"><label>${esc(s.stkPortal)}</label><input name="portalUrl" inputmode="url" autocomplete="off" placeholder="http://host:port/c/" required>
<label>${esc(s.stkMac)}</label><input name="mac" autocomplete="off" placeholder="00:1A:79:AA:BB:CC" required><button class="go" type="submit">${esc(s.sendToTv)}</button></form>` : ""}
<script>
document.querySelectorAll(".seg button").forEach(function(b){b.onclick=function(){document.querySelectorAll(".seg button,.kind").forEach(function(e){e.classList.toggle("on",e.dataset.k===b.dataset.k)})}});
var f=document.querySelector('form[data-k="m3u"]');f.onsubmit=function(e){var file=f.querySelector("input[type=file]").files[0];var url=f.server.value.trim();
if(!file&&!url){e.preventDefault();f.querySelector(".err").hidden=false;return}if(!file)return;e.preventDefault();var r=new FileReader();
r.onload=function(){f.playlistFile.value=r.result;f.playlistFileName.value=file.name;f.querySelector(".go").textContent=${JSON.stringify(s.sending)};f.submit()};r.readAsText(file)};
</script>`, lang);
}

function savedPage(s, lang, pin) {
  return page(s, s.savedPageTitle, `<h1>${esc(s.savedHeading)}</h1><a class="go" href="/?pin=${encodeURIComponent(pin)}">${esc(s.sendAnother)}</a>`, lang);
}

function syncPage(s, lang) {
  return page(s, s.syncTitle, `<h1>${esc(s.syncTitle)}</h1><p>${esc(s.syncBody)}</p>`, lang);
}

/** Reads a body up to [limit] bytes; null past it. */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > limit) { req.resume(); resolve(null); return; }
    const chunks = [];
    let total = 0;
    let over = false;
    req.on("data", (c) => { total += c.length; if (total > limit) over = true; else chunks.push(c); });
    req.on("end", () => resolve(over ? null : Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Starts the server. [strings]/[lang]: the page in the app's language. [onPayload] gets a playlist ("add"),
 * [onBackup] a backup's text ("sync"), [backup] is this device's own for GET /backup ("sync"), [onLocked] hears
 * the lock after too many wrong PINs. Resolves to { urls, pin, port, close }.
 */
function startCompanion({ mode, strings, lang = "en", port = DEFAULT_PORT, withStalker = true, onPayload, onBackup, backup, onLocked, host = "0.0.0.0", pin = newPin(), interfaces }) {
  let attempts = 0;
  let locked = false;
  const s = strings;
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const path = u.pathname;
    const send = (code, type, body, extra = {}) => { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", ...extra }); res.end(body); };
    const html = (code, body) => send(code, "text/html; charset=utf-8", body);
    const given = u.searchParams.get("pin") || String(req.headers["x-companion-pin"] ?? "");
    const ok = (candidate) => pinEquals(candidate, pin);
    /** A wrong PIN: a pause, a count, and the server closes at the limit. */
    const strike = async () => {
      attempts++;
      await new Promise((r) => setTimeout(r, FAILED_PIN_DELAY_MS));
      if (attempts >= MAX_PIN_ATTEMPTS && !locked) { locked = true; setImmediate(() => { server.close(); onLocked?.(); }); }
    };
    const guard = async () => {
      if (ok(given)) { attempts = 0; return true; }
      await strike();
      send(401, "text/plain; charset=utf-8", s.unauthorized);
      return false;
    };
    try {
      if (locked) { send(423, "text/plain", "locked"); return; }
      if (req.method === "GET" && (path === "/" || path === "/index.html")) {
        if (mode === "sync") { html(200, syncPage(s, lang)); return; }
        if (given && ok(given)) { attempts = 0; html(200, addPage(s, lang, pin, withStalker)); return; }
        if (given) await strike();
        html(200, gatePage(s, lang, given ? s.pinMismatch : null));
        return;
      }
      if (req.method === "POST" && path === "/" && mode === "add") {
        const body = await readBody(req, FORM_BODY_LIMIT);
        const submitted = parseQuery(body ?? "").pin ?? "";
        if (ok(submitted)) { attempts = 0; html(200, addPage(s, lang, pin, withStalker)); return; }
        await strike();
        html(200, gatePage(s, lang, s.pinMismatch));
        return;
      }
      if (req.method === "POST" && mode === "add" && (path === "/m3u" || path === "/xtream" || path === "/stalker")) {
        if (!(await guard())) return;
        const body = await readBody(req, maxBodyBytes(path));
        if (body === null) { send(413, "text/plain", "too large"); return; }
        const payload = parsePayload(req.headers["content-type"], body, path.slice(1));
        if (!payload || (payload.type === "stalker" && !withStalker)) { send(400, "text/plain; charset=utf-8", s.missingFields); return; }
        onPayload?.(payload);
        html(200, savedPage(s, lang, pin));
        return;
      }
      if (mode === "sync" && path === "/backup") {
        if (!(await guard())) return;
        if (req.method === "GET") { send(200, "application/json; charset=utf-8", backup ?? ""); return; }
        if (req.method === "POST") {
          const body = await readBody(req, UPLOAD_BODY_LIMIT);
          if (body === null) { send(413, "text/plain", "too large"); return; }
          const accepted = await onBackup?.(body);
          if (accepted === false) { send(400, "text/plain", "bad backup"); return; }
          send(200, "application/json", '{"ok":true}');
          return;
        }
      }
      send(404, "text/plain", "not found");
    } catch (e) {
      if (!res.headersSent) send(500, "text/plain", String(e && e.message ? e.message : e));
    }
  });
  return new Promise((resolve, reject) => {
    const listen = (p, retried) => {
      server.once("error", (e) => (!retried && e.code === "EADDRINUSE" ? listen(0, true) : reject(e)));
      server.listen(p, host, () => {
        const actual = server.address().port;
        resolve({ urls: lanUrls(actual, interfaces), pin, port: actual, close: () => new Promise((r) => server.close(() => r())) });
      });
    };
    listen(port, false);
  });
}

/** The far side of a sync, as an address someone typed: `192.168.1.5`, `192.168.1.5:8089`, `http://…/`. */
function syncBase(address) {
  let a = String(address).trim();
  if (!a) return null;
  if (!/^https?:\/\//i.test(a)) a = `http://${a}`;
  try {
    const u = new URL(a);
    return `${u.protocol}//${u.hostname}:${u.port || DEFAULT_PORT}`;
  } catch { return null; }
}

/** What a sync request ended in: the body, or "unreachable" / "unauthorized" / "bad". */
async function syncRequest(address, pin, method, body, fetchImpl = fetch) {
  const base = syncBase(address);
  if (!base) return { error: "unreachable" };
  let res;
  try {
    res = await fetchImpl(`${base}/backup`, {
      method, body, headers: { "X-Companion-Pin": pin, ...(body ? { "Content-Type": "application/json" } : {}) },
      signal: AbortSignal.timeout(30_000),
    });
  } catch { return { error: "unreachable" }; }
  if (res.status === 401 || res.status === 423) return { error: "unauthorized" };
  if (res.status === 404) return { error: "unreachable" }; // no SkMate waiting there
  if (!res.ok) return { error: "bad" };
  return { text: await res.text() };
}

module.exports = {
  DEFAULT_PORT, MAX_PIN_ATTEMPTS, pinEquals, parseQuery, parsePayload, isPrivateLan, lanUrls, newPin, maxBodyBytes,
  startCompanion, syncBase, syncRequest,
};
