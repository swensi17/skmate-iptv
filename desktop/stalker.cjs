// Stalker / Ministra portals (a MAC address instead of a playlist) for the Windows app, after the Android app's
// StalkerClient: a portal wants a MAG box's Cookie, User-Agent and Referer, which a page may not send, so this main
// process talks to it. The page sees an ordinary M3U, guide and channel addresses on 127.0.0.1; a channel's address
// mints a fresh link with create_link each time it is opened (portal links die within hours) and redirects to it.
// The player, recording, VLC/mpv and the archive therefore work with a portal exactly as with any playlist.
const http = require("node:http");

const DEFAULT_MAG_USER_AGENT =
  "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2721 Safari/533.3";
const DEFAULT_SESSION_TTL_MS = 5 * 60_000;
const MIN_SESSION_TTL_MS = 60_000;
const MAX_SESSION_TTL_MS = 15 * 60_000;
const HOURS_PER_DAY = 24;
const GUIDE_DAYS = 3;
const MAX_GUIDE_PAGES = 12;
const MATCH_TOLERANCE_MS = 15 * 60_000;
const CMD_PREFIXES = ["ffmpeg ", "ffrt2 ", "ffrt3 ", "ffrt ", "auto "];

class AuthError extends Error {}

/** `AA:BB:CC:DD:EE:FF` from any spelling; null unless 12 letters or digits (some panels hand out "MACs" past F). */
function canonicalizeMac(raw) {
  const body = String(raw).trim().replace(/[:\-. ]/g, "");
  if (body.length !== 12 || !/^[0-9a-z]+$/i.test(body)) return null;
  return body.toUpperCase().match(/../g).join(":");
}

/** What was pasted, without the `/c/` page and trailing slashes: the portal root. */
function portalRoot(input) {
  let root = String(input).trim().replace(/\/+$/, "");
  if (/\/c$/i.test(root)) root = root.slice(0, -2).replace(/\/+$/, "");
  return root;
}

/** API endpoints to try, in order: a pasted `.php` first, then portal.php and the stalker_portal layouts. */
function apiCandidates(input) {
  const trimmed = String(input).trim().replace(/\/+$/, "");
  if (/\.php$/i.test(trimmed)) {
    return [trimmed, ...apiCandidates(trimmed.slice(0, trimmed.lastIndexOf("/"))).filter((c) => c !== trimmed)];
  }
  const root = portalRoot(trimmed);
  return [`${root}/portal.php`, `${root}/stalker_portal/server/load.php`, `${root}/server/load.php`];
}

function isValidPortalUrl(input) {
  const root = portalRoot(input);
  if (!/^https?:\/\//i.test(root)) return false;
  try { return Boolean(new URL(root).host); } catch { return false; }
}

/** create_link's `ffmpeg ` / `auto ` prefix off; a plain address passes through. */
function stripCmdPrefix(cmd) {
  const t = String(cmd).trim();
  const p = CMD_PREFIXES.find((x) => t.toLowerCase().startsWith(x));
  return p ? t.slice(p.length).trim() : t;
}

/** A channel cmd that already is the stream (real host and a query or a file): played as it is, not via create_link. */
function isDirectPlayUrl(stripped) {
  let u;
  try { u = new URL(stripped); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  if (u.hostname.toLowerCase() === "localhost" || u.hostname === "127.0.0.1") return false;
  return u.search.length > 1 || u.pathname.includes(".");
}

/** Ministra says `enable_tv_archive` or `archive`, Xtream `tv_archive`: any of them is a yes. */
function hasArchive(f) {
  return ["enable_tv_archive", "archive", "tv_archive"].some((k) => (parseInt(String(f[k] ?? "").trim(), 10) || 0) > 0);
}

/** `tv_archive_duration` is in hours; under 24 it plainly means days. */
function archiveDays(raw) {
  const v = parseInt(String(raw ?? "").trim(), 10);
  if (!(v > 0)) return 0;
  return v < HOURS_PER_DAY ? v : Math.floor(v / HOURS_PER_DAY);
}

/** How long a token is trusted: the portal's `watchdog_timeout`, kept between one and fifteen minutes. */
function sessionTtlMs(profile) {
  const raw = String(profile.watchdog_timeout ?? "").trim();
  const s = /^-?\d+$/.test(raw) ? Number(raw) : 0;
  if (s <= 0) return DEFAULT_SESSION_TTL_MS;
  return Math.min(MAX_SESSION_TTL_MS, Math.max(MIN_SESSION_TTL_MS, s * 1000));
}

/** The `js` payload of a portal answer; `{"js":false}` and the like mean the token or the MAC was refused. */
function unwrap(text) {
  let body;
  try { body = JSON.parse(String(text).trim()); } catch { throw new Error("Portal response is not JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Portal response is not JSON");
  if (!("js" in body)) throw new Error('Portal response has no "js" payload');
  const js = body.js;
  if (js === null || typeof js !== "object") throw new AuthError("Portal returned an empty payload — token expired or MAC not authorized");
  return js;
}

/** Scalar fields only, as strings (nested values are not the profile's business). */
function scalars(o) {
  const out = {};
  if (!o || typeof o !== "object") return out;
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  }
  return out;
}

/** The list in a payload: the array itself or its `data`. */
const rowsOf = (js) => (Array.isArray(js) ? js : Array.isArray(js && js.data) ? js.data : []);

function channelsOf(js) {
  return rowsOf(js).map(scalars).flatMap((f) => {
    const id = f.id?.trim();
    const cmd = f.cmd?.trim();
    if (!id || !cmd) return [];
    return [{
      id, cmd, name: f.name || f.title || id, number: f.number || null, logo: f.logo || null,
      xmltvId: f.xmltv_id || null, genreId: f.tv_genre_id || null, archive: hasArchive(f), archiveDays: archiveDays(f.tv_archive_duration),
    }];
  });
}

function genresOf(js) {
  return rowsOf(js).map(scalars).filter((g) => g.id && g.title).map((g) => ({ id: g.id, title: g.title }));
}

/** `get_profile`'s rejection: an object with a message and no `id`. */
function profileRefusal(profile) {
  if (profile.id && profile.id.trim()) return null;
  return profile.msg?.trim() || profile.block_msg?.trim() || null;
}

/** Epoch seconds first, else the portal's `yyyy-MM-dd HH:mm:ss` in this computer's zone. */
function epgTimeMs(epochSec, wallClock) {
  const n = Number(epochSec);
  if (epochSec != null && String(epochSec).trim() !== "" && Number.isFinite(n) && n > 0) return n * 1000;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(String(wallClock ?? "").trim());
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null;
}

/** Programmes of `get_epg_info`, both shapes: keyed by channel id, or one array whose rows say `ch_id`. */
function guideOf(js) {
  const out = [];
  const take = (rows, keyed) => {
    for (const r of rows) {
      const f = scalars(r);
      const ch = keyed ?? f.ch_id;
      const start = epgTimeMs(f.start_timestamp, f.time);
      const stop = epgTimeMs(f.stop_timestamp, f.time_to);
      if (ch && start && stop && f.name) out.push({ ch, start, stop, title: f.name, descr: f.descr || null });
    }
  };
  const walk = (v) => {
    if (Array.isArray(v)) { take(v, null); return; }
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if (k === "data") walk(x);
      else if (Array.isArray(x)) take(x, k);
    }
  };
  walk(js);
  return out;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attr = (s) => String(s).replace(/"/g, "'").replace(/[\r\n]+/g, " ");
/** The guide id of a channel: its `xmltv_id` (so other guides match too), else one of ours. */
const tvgId = (c) => c.xmltvId || `stalker-${c.id}`;

/** An M3U for [channels]: categories from [genres], addresses from [base] (this server). */
function toM3U(channels, genres, base) {
  const genre = new Map(genres.map((g) => [g.id, g.title]));
  const lines = [`#EXTM3U url-tvg="${base}/guide.xml"`];
  for (const c of channels) {
    const a = [`tvg-id="${attr(tvgId(c))}"`, `tvg-name="${attr(c.name)}"`];
    if (c.logo) a.push(`tvg-logo="${attr(c.logo)}"`);
    if (c.number) a.push(`tvg-chno="${attr(c.number)}"`);
    a.push(`group-title="${attr(genre.get(c.genreId) ?? "")}"`);
    if (c.archive && c.archiveDays > 0) {
      a.push(`catchup="default"`, `catchup-days="${c.archiveDays}"`,
        `catchup-source="${base}/archive/${encodeURIComponent(c.id)}?start={utc}&end={utcend}"`);
    }
    lines.push(`#EXTINF:-1 ${a.join(" ")},${c.name.replace(/[\r\n]+/g, " ")}`);
    lines.push(`${base}/live/${encodeURIComponent(c.id)}?cmd=${encodeURIComponent(c.cmd)}`);
  }
  return lines.join("\n") + "\n";
}

const xmltvTime = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())} +0000`;
};

/** The portal's own guide as XMLTV, with the channel ids the M3U names. */
function toXmltv(channels, programmes) {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv generator-info-name="SkMate IPTV">'];
  for (const c of channels) out.push(`<channel id="${esc(tvgId(c))}"><display-name>${esc(c.name)}</display-name></channel>`);
  for (const p of programmes) {
    const c = byId.get(p.ch);
    if (!c) continue;
    out.push(`<programme start="${xmltvTime(p.start)}" stop="${xmltvTime(p.stop)}" channel="${esc(tvgId(c))}"><title>${esc(p.title)}</title>${p.descr ? `<desc>${esc(p.descr)}</desc>` : ""}</programme>`);
  }
  out.push("</tv>");
  return out.join("\n");
}

/** One portal account: handshake, profile, the calls, a token kept while the portal allows, one retry when it dies. */
function portal({ url, mac, userAgent, fetchImpl = fetch, now = Date.now, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone }) {
  const ua = userAgent || DEFAULT_MAG_USER_AGENT;
  let session = null;
  let opening = null;
  // The list once fetched serves the guide that is asked for right after it, not a second crawl of the portal.
  let listed = null;
  const LIST_KEEP_MS = 60_000;
  const headers = (apiUrl, token) => {
    const h = {
      "User-Agent": ua,
      Cookie: `mac=${encodeURIComponent(mac)}; stb_lang=en; timezone=${timeZone}`,
      "X-User-Agent": "Model: MAG250; Link: WiFi",
      Referer: `${portalRoot(apiUrl.split("?")[0].replace(/\/[^/]*$/, ""))}/c/`,
    };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  };
  const get = async (apiBase, query, token) => {
    const u = `${apiBase}?${query}&JsHttpRequest=1-xml`;
    const res = await fetchImpl(u, { headers: headers(u, token), redirect: "follow" });
    if (res.status === 401) throw new AuthError(`Portal rejected the request (HTTP ${res.status})`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return unwrap(await res.text());
  };
  const open = async () => {
    let lastError = null;
    for (const apiBase of apiCandidates(url)) {
      let token;
      try {
        token = scalars(await get(apiBase, "type=stb&action=handshake&token=", null)).token;
        if (!token) throw new Error("Portal handshake returned no token");
      } catch (e) {
        // A refusal says more than the 404 of the endpoints tried after it.
        if (!(lastError instanceof AuthError)) lastError = e;
        continue;
      }
      const profile = scalars(await get(apiBase, "type=stb&action=get_profile&hd=1&auth_second_step=0", token));
      if (Object.keys(profile).length === 0) throw new AuthError("Portal accepted the handshake but returned an empty profile — the MAC may not be authorized");
      const refused = profileRefusal(profile);
      if (refused) throw new AuthError(refused);
      return { apiBase, token, profile, until: now() + sessionTtlMs(profile) };
    }
    throw lastError ?? new Error(`No portal API endpoint for ${url}`);
  };
  const current = async () => {
    if (session && now() < session.until) return session;
    if (!opening) opening = open().then((s) => { session = s; return s; }).finally(() => { opening = null; });
    return opening;
  };
  /** [query] with a live session; a token that died mid-way gets one fresh handshake. */
  const call = async (query) => {
    const s = await current();
    try { return await get(s.apiBase, query, s.token); } catch (e) {
      if (!(e instanceof AuthError)) throw e;
      if (session === s) session = null;
      const fresh = await current();
      return get(fresh.apiBase, query, fresh.token);
    }
  };
  const enc = encodeURIComponent;

  return {
    session: current,
    async channels() {
      if (listed && now() - listed.at < LIST_KEEP_MS) return listed.value;
      await current(); // a refused MAC or a dead portal is an error, not an empty list
      const genres = genresOf(await call("type=itv&action=get_genres").catch(() => []));
      let list = [];
      // Some portals cap or refuse the whole list at once; they are walked genre by genre instead, as on Android.
      try { list = channelsOf(await call("type=itv&action=get_all_channels")); } catch { list = []; }
      if (list.length === 0) {
        for (const g of genres) {
          for (let p = 1; p <= 200; p++) {
            const js = await call(`type=itv&action=get_ordered_list&genre=${enc(g.id)}&p=${p}`);
            const page = channelsOf(js);
            list.push(...page);
            const total = parseInt(js.total_items, 10) || 0;
            const per = parseInt(js.max_page_items, 10) || page.length;
            if (page.length === 0 || p * per >= total) break;
          }
        }
      }
      listed = { at: now(), value: { channels: list, genres } };
      return listed.value;
    },
    /** A playable address for a channel's cmd: as it is when it already is one, else a fresh create_link. */
    async link(cmd, type = "itv") {
      const direct = stripCmdPrefix(cmd);
      if (type === "itv" && isDirectPlayUrl(direct)) return direct;
      const js = scalars(await call(`type=${enc(type)}&action=create_link&cmd=${enc(cmd)}&forced_storage=0&disable_ad=0`));
      if (!js.cmd || !js.cmd.trim()) throw new AuthError("Portal create_link returned no cmd — token may have expired");
      return stripCmdPrefix(js.cmd);
    },
    async guide(days = GUIDE_DAYS) { return guideOf(await call(`type=itv&action=get_epg_info&period=${days}`)); },
    /** The archive of a past programme: the portal's own programme id from its day table, as Android finds it. */
    async archive(channelId, startMs, endMs) {
      const d = new Date(startMs);
      const p2 = (n) => String(n).padStart(2, "0");
      const date = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
      const pageAt = async (p) => {
        const js = await call(`type=epg&action=get_simple_data_table&ch_id=${enc(channelId)}&date=${enc(date)}&p=${p}`);
        const items = rowsOf(js).map(scalars).flatMap((f) => {
          const start = epgTimeMs(f.start_timestamp, f.time);
          const stop = epgTimeMs(f.stop_timestamp, f.time_to);
          return f.id && start && stop ? [{ id: f.id, start, stop }] : [];
        });
        return { items, total: parseInt(js.total_items, 10) || 0, per: parseInt(js.max_page_items, 10) || 0 };
      };
      let nearest = null;
      const consider = (items) => {
        for (const it of items) if (!nearest || Math.abs(it.start - startMs) < Math.abs(nearest.start - startMs)) nearest = it;
      };
      const covering = (items) => items.find((it) => startMs >= it.start && startMs < it.stop);
      let id = null;
      try {
        const first = await pageAt(1);
        id = covering(first.items)?.id ?? null;
        if (!id && first.items.length > 0) {
          consider(first.items);
          const per = first.per || first.items.length;
          let low = 2;
          let high = Math.min(MAX_GUIDE_PAGES, Math.ceil(first.total / per));
          while (low <= high && !id) {
            const mid = Math.floor((low + high) / 2);
            const r = await pageAt(mid);
            if (r.items.length === 0) break;
            id = covering(r.items)?.id ?? null;
            consider(r.items);
            if (startMs < r.items[0].start) high = mid - 1;
            else if (startMs >= r.items[r.items.length - 1].stop) low = mid + 1;
            else break;
          }
          if (!id && nearest && Math.abs(nearest.start - startMs) <= MATCH_TOLERANCE_MS) id = nearest.id;
        }
      } catch (e) { if (e instanceof AuthError) throw e; }
      const cmd = id ? `auto /media/${id}.mpg`
        : `auto /media/${channelId}_${Math.floor(startMs / 1000)}_${Math.max(60, Math.floor((endMs - startMs) / 1000))}.mpg`;
      return this.link(cmd, "tv_archive");
    },
  };
}

/** `stalker:<portal>#mac=<MAC>` (how the page stores a portal) ↔ the account; null when it is not one. */
function parseSource(s) {
  const m = /^stalker:(.+)#mac=([^&]+)$/.exec(String(s));
  if (!m) return null;
  const mac = canonicalizeMac(decodeURIComponent(m[2]));
  return mac && isValidPortalUrl(m[1]) ? { url: m[1], mac } : null;
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s) => Buffer.from(s, "base64url").toString("utf8");

/**
 * The server on 127.0.0.1 the page and the players read: /s/<source>/playlist.m3u, /guide.xml, /live/<id>?cmd=,
 * /archive/<id>?start=&end= (Unix seconds). A portal that refuses the MAC answers 401, an unreachable one 502.
 * [onStreamHost] hears each host a link points to, so the window can send it the MAG User-Agent too.
 */
function startServer({ port = 0, fetchImpl = fetch, onStreamHost } = {}) {
  const accounts = new Map();
  const account = (key) => {
    let a = accounts.get(key);
    if (!a) {
      const src = parseSource(unb64(key));
      if (!src) return null;
      a = portal({ ...src, fetchImpl });
      accounts.set(key, a);
    }
    return a;
  };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    const m = /^\/s\/([^/]+)\/(playlist\.m3u|guide\.xml|live\/[^/]+|archive\/[^/]+)$/.exec(u.pathname);
    const send = (code, type, body, extra = {}) => {
      res.writeHead(code, { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store", ...extra });
      res.end(body);
    };
    if (!m) { send(404, "text/plain", "not found"); return; }
    const a = account(m[1]);
    if (!a) { send(400, "text/plain", "bad source"); return; }
    const base = `http://127.0.0.1:${server.address().port}/s/${m[1]}`;
    try {
      if (m[2] === "playlist.m3u") {
        const { channels, genres } = await a.channels();
        send(200, "audio/x-mpegurl; charset=utf-8", toM3U(channels, genres, base));
      } else if (m[2] === "guide.xml") {
        const [{ channels }, programmes] = await Promise.all([a.channels(), a.guide()]);
        send(200, "application/xml; charset=utf-8", toXmltv(channels, programmes));
      } else {
        const id = decodeURIComponent(m[2].split("/")[1]);
        const target = m[2].startsWith("live/")
          ? await a.link(u.searchParams.get("cmd") ?? "")
          : await a.archive(id, Number(u.searchParams.get("start")) * 1000, Number(u.searchParams.get("end")) * 1000);
        try { onStreamHost?.(new URL(target).host); } catch { /* not a URL: the player will say so */ }
        send(302, "text/plain", "", { Location: target });
      }
    } catch (e) {
      send(e instanceof AuthError ? 401 : 502, "text/plain; charset=utf-8", String(e && e.message ? e.message : e));
    }
  });
  return new Promise((resolve, reject) => {
    const listen = (p) => {
      server.once("error", (e) => (p !== 0 && e.code === "EADDRINUSE" ? listen(0) : reject(e)));
      server.listen(p, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${server.address().port}`, sourceKey: b64 }));
    };
    listen(port);
  });
}

module.exports = {
  DEFAULT_MAG_USER_AGENT, AuthError, canonicalizeMac, portalRoot, apiCandidates, isValidPortalUrl, stripCmdPrefix,
  isDirectPlayUrl, hasArchive, archiveDays, sessionTtlMs, unwrap, channelsOf, genresOf, profileRefusal, epgTimeMs,
  guideOf, toM3U, toXmltv, portal, parseSource, startServer,
};
