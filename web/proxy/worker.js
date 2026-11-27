// Playlist proxy for the SkMate web app (Cloudflare Workers, free plan). Used ONLY as a fallback: the app asks the
// provider directly first and comes here only when the browser blocked that (the provider sends no CORS header).
//
// What it does: GET /?url=<playlist address> fetches that playlist and returns its text with a CORS header.
// What it never does: video (only text that starts with #EXTM3U, at most MAX_BYTES), logging, storing, cookies.
// Safety: only our own sites may call it (ORIGINS), only http(s) addresses of public hosts, GET only, time limit.

const ORIGINS = ["http://skmate.uz", "https://skmate.uz", "http://www.skmate.uz", "https://www.skmate.uz"];
const MAX_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

/** Addresses that point inside a network (this machine, a home router, a cloud's metadata) are never fetched. */
function isPrivateHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.includes(":")) return true; // IPv6 literals: not needed for playlists
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function reply(status, body, origin) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(body, { status, headers });
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin");
    const allowed = origin && ORIGINS.includes(origin) ? origin : null;
    if (request.method === "OPTIONS") return reply(204, null, allowed);
    if (request.method !== "GET") return reply(405, "method", allowed);
    if (!allowed) return reply(403, "origin", null);

    let target;
    try { target = new URL(new URL(request.url).searchParams.get("url") || ""); } catch { return reply(400, "bad url", allowed); }
    if (!/^https?:$/.test(target.protocol) || isPrivateHost(target.hostname) || target.username || target.password) return reply(400, "bad url", allowed);

    let upstream;
    try {
      upstream = await fetch(target.toString(), {
        method: "GET", redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0 (SkMate)", "Accept": "*/*" }, // no cookies, no referrer of ours
      });
    } catch { return reply(502, "unreachable", allowed); }
    if (!upstream.ok) return reply(upstream.status === 403 || upstream.status === 404 ? upstream.status : 502, "upstream " + upstream.status, allowed);
    // A playlist is text: the body is read up to the limit, then checked, and nothing else is passed on.
    const reader = upstream.body.getReader();
    const chunks = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); return reply(413, "too big", allowed); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let at = 0;
    for (const c of chunks) { bytes.set(c, at); at += c.length; }
    const text = new TextDecoder("utf-8").decode(bytes);
    if (!/^[﻿\s]*#EXTM3U/.test(text.slice(0, 4096)) && !text.slice(0, 4096).includes("#EXTINF:")) return reply(415, "not a playlist", allowed);
    const out = reply(200, text, allowed);
    out.headers.set("Content-Type", "text/plain; charset=utf-8");
    return out;
  },
};
