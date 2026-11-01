// Catch-up (archive) addresses for a past programme: the same rules as the Android app's CatchupUrl
// (engine/core/.../epg/CatchupUrl.kt), so one playlist opens the same archive on every screen.
//
// Two provider conventions:
//  - M3U carries a `catchup-source` template with placeholders (`${start}`, `{utc}`, `{Y}-{m}-{d}`, …)
//    filled from the programme's start and end; `catchup="append"` joins it onto the live URL.
//  - An Xtream panel (also behind a plain M3U, `catchup="xc"`) has a timeshift endpoint rebuilt from
//    the credentials in the live URL.
// Pure string work: no I/O, easy to test.

/** Unix-second tokens (both `${name}` and `{name}`, case-insensitive). */
const START_TOKENS = new Set(["start", "utc", "start-timestamp", "utcstart"]);
const END_TOKENS = new Set(["end", "utcend", "end-timestamp", "stop"]);
/** "Now". Kodi documents `${timestamp}` as the same as `{lutc}`. */
const NOW_TOKENS = new Set(["lutc", "now", "timenow", "currenttime", "timestamp"]);

/** `{name}` / `${name}`, optionally with an argument after a colon: `{duration:60}`, `{utc:YmdHMS}`. */
const TOKEN = /\$?\{([A-Za-z_][A-Za-z0-9_-]*)(?::([^}]*))?\}/g;
/** Legacy archive tokens: `${(b)FMT}`, `${(e)FMT}`, optional `:utc`. Run before [TOKEN]. */
const LEGACY = /\$\{\((b|e)\)([^}]+?)(?::(utc))?\}/g;
/** A run of 2+ Java SimpleDateFormat letters (`yyyy`, `MM`, `HH`, …). Single Kodi letters do not match. */
const JAVA_PATTERN_RUN = /([yMLwdDFuHkKhmsS])\1+/;
const DATE_LETTERS = "YmdHMS";
/** The `shift` convention's fixed query. */
const SHIFT_TEMPLATE = "?utc={utc}&lutc={lutc}";

interface Fields { Y: number; m: number; d: number; H: number; M: number; S: number; ms: number }

const two = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** The date fields of [ms] in [tz] (an IANA zone; UTC when absent). */
function fieldsOf(ms: number, tz?: string): Fields {
  const date = new Date(ms);
  if (!tz || tz === "UTC") {
    return {
      Y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(),
      H: date.getUTCHours(), M: date.getUTCMinutes(), S: date.getUTCSeconds(), ms: date.getUTCMilliseconds(),
    };
  }
  // toLocaleString with a zone works on the old TV browsers too (formatToParts does not).
  const s = date.toLocaleString("en-US", {
    timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const n = s.match(/\d+/g)?.map(Number) ?? [];
  const [mo = 1, d = 1, Y = 1970, H = 0, M = 0, S = 0] = n;
  return { Y, m: mo, d, H: H % 24, M, S, ms: date.getUTCMilliseconds() };
}

/** [ms] in [tz], with each of Y m d H M S in [format] replaced by that field; other characters kept. */
function formatDateLetters(ms: number, format: string, tz?: string): string {
  const f = fieldsOf(ms, tz);
  let out = "";
  for (const c of format) {
    switch (c) {
      case "Y": out += String(f.Y); break;
      case "m": out += two(f.m); break;
      case "d": out += two(f.d); break;
      case "H": out += two(f.H); break;
      case "M": out += two(f.M); break;
      case "S": out += two(f.S); break;
      default: out += c;
    }
  }
  return out;
}

/** True when every letter is a Kodi date letter and at least one is present. */
function isKodiFormat(fmt: string): boolean {
  let any = false;
  for (const c of fmt) {
    if (!/[A-Za-z]/.test(c)) continue;
    if (!DATE_LETTERS.includes(c)) return false;
    any = true;
  }
  return any;
}

/** The subset of Java's SimpleDateFormat the archive templates use; null for a pattern it cannot do. */
function formatJava(ms: number, fmt: string, tz?: string): string | null {
  if (fmt.includes("'")) return null; // quoting: not used by any provider seen, and an unclosed quote is an error in Java
  const f = fieldsOf(ms, tz);
  let out = "";
  for (let i = 0; i < fmt.length;) {
    const c = fmt[i] as string;
    let n = 1;
    while (fmt[i + n] === c) n++;
    i += n;
    if (!/[A-Za-z]/.test(c)) { out += c.repeat(n); continue; }
    const pad = (v: number) => String(v).padStart(n, "0");
    switch (c) {
      case "y": out += n === 2 ? two(f.Y % 100) : pad(f.Y); break;
      case "M": out += pad(f.m); break;
      case "d": out += pad(f.d); break;
      case "H": out += pad(f.H); break;
      case "m": out += pad(f.M); break;
      case "s": out += pad(f.S); break;
      case "S": out += String(f.ms).padStart(Math.max(n, 3), "0"); break;
      default: return null;
    }
  }
  return out;
}

/** `${(b)FMT}` / `${(e)FMT}`; the original token when FMT is unknown or not a valid pattern. */
function legacyToken(whole: string, which: string, fmt: string, utc: string | undefined, startMs: number, endMs: number, tz?: string): string {
  const ms = which === "b" ? startMs : endMs;
  const zone = utc ? "UTC" : tz;
  if (fmt.toLowerCase() === "timestamp") return String(Math.floor(ms / 1000));
  if (fmt.includes("y") || JAVA_PATTERN_RUN.test(fmt)) return formatJava(ms, fmt, zone) ?? whole;
  if (isKodiFormat(fmt)) return formatDateLetters(ms, fmt, zone);
  return whole;
}

/** [seconds] divided by the whole number [arg]; null when [arg] is not a positive number. */
function divided(seconds: number, arg: string): string | null {
  if (!/^\d+$/.test(arg)) return null;
  const by = Number(arg);
  return by > 0 ? String(Math.floor(seconds / by)) : null;
}

/**
 * Fill an M3U `catchup-source` [template] for the programme spanning [startMs]..[endMs]. Placeholders
 * as in Kodi IPTV Simple: unix start/end/now, duration/offset (optionally divided: `{duration:60}`),
 * formatted instants (`{utc:YmdHMS}`), the bare date parts of the start, and the legacy `${(b)FMT}` /
 * `${(e)FMT}` (these follow [tz]; a `:utc` suffix forces UTC). Unknown placeholders are left as they are.
 */
export function fromTemplate(template: string, startMs: number, endMs: number, nowMs: number = Date.now(), tz?: string): string {
  const filled = template.replace(LEGACY, (whole, which: string, fmt: string, utc?: string) =>
    legacyToken(whole, which, fmt, utc, startMs, endMs, tz));
  const durationS = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const offsetS = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  return filled.replace(TOKEN, (whole, raw: string, arg?: string) => {
    const name = raw.toLowerCase();
    const instant = START_TOKENS.has(name) ? startMs : END_TOKENS.has(name) ? endMs : NOW_TOKENS.has(name) ? nowMs : null;
    if (arg !== undefined) {
      if (instant !== null && arg !== "") return formatDateLetters(instant, arg);
      if (name === "duration") return divided(durationS, arg) ?? whole;
      if (name === "offset") return divided(offsetS, arg) ?? whole;
      return whole;
    }
    if (instant !== null) return String(Math.floor(instant / 1000));
    if (name === "duration") return String(durationS);
    if (name === "offset") return String(offsetS);
    // Date parts are single letters and case-sensitive (m = month, M = minute): mapped by the original token.
    if (raw.length === 1 && DATE_LETTERS.includes(raw)) return formatDateLetters(startMs, raw);
    return whole;
  });
}

/**
 * Join an appended query [fragment] onto [base]. Playlists write it as "?utc=…", "&utc=…" or a bare
 * "utc=…"; a base that already has a query (a CDN token) must not get a second "?".
 */
function joinQuery(base: string, fragment: string): string {
  if (fragment === "") return base;
  const body = fragment.replace(/^\?/, "").replace(/^&/, "");
  return base.includes("?") ? `${base}&${body}` : `${base}?${body}`;
}

/**
 * Flussonic: the archive is a sibling of the live playlist. `…/ch/index.m3u8` → `…/ch/timeshift_abs-<start>.m3u8`;
 * `…/ch/mpegts` or `…/ch/index.ts` → `…/ch/archive-<start>-<duration>.ts`. The query is kept.
 */
function flussonic(liveUrl: string, startMs: number, endMs: number): string | null {
  const q = liveUrl.indexOf("?");
  const query = q >= 0 ? liveUrl.slice(q) : "";
  const path = q >= 0 ? liveUrl.slice(0, q) : liveUrl;
  const slash = path.lastIndexOf("/");
  if (slash <= 0 || /^[a-z]+:\/\/[^/]*$/i.test(path)) return null;
  const last = path.slice(slash + 1).toLowerCase();
  const prefix = path.slice(0, slash + 1);
  const startS = Math.floor(startMs / 1000);
  const durationS = Math.max(1, Math.floor((endMs - startMs) / 1000));
  if (last.endsWith(".m3u8")) return `${prefix}timeshift_abs-${startS}.m3u8${query}`;
  if (last === "mpegts" || last.endsWith(".ts")) return `${prefix}archive-${startS}-${durationS}.ts${query}`;
  return null;
}

const XC_LIVE_URL = /^(https?:\/\/[^/]+)\/(?:live\/)?([^/]+)\/([^/]+)\/(\d+)(?:\.[A-Za-z0-9]+)?$/i;

/** Xtream's start stamp: `2021-01-01:00-00` in the panel's zone. */
function xtreamStart(ms: number, tz?: string): string {
  const f = fieldsOf(ms, tz);
  return `${f.Y}-${two(f.m)}-${two(f.d)}:${two(f.H)}-${two(f.M)}`;
}

/** `catchup="xc"`: an Xtream panel behind a plain M3U; its timeshift endpoint rebuilt from the live URL. */
function xtreamStyle(liveUrl: string, startMs: number, endMs: number, tz?: string): string | null {
  const g = XC_LIVE_URL.exec(liveUrl.split("?")[0] as string);
  if (!g) return null;
  const durationMin = Math.max(1, Math.floor((endMs - startMs) / 60_000));
  return `${g[1]}/streaming/timeshift.php?username=${g[2]}&password=${g[3]}&stream=${g[4]}&start=${xtreamStart(startMs, tz)}&duration=${durationMin}`;
}

/**
 * The archive URL of an M3U channel from its `catchup` [type] and `catchup-source` [source] template:
 * append, a plain template, shift/timeshift/default, flussonic, xc. Null when nothing usable can be built.
 * [correctionMin] is the playlist's `catchup-correction`: the provider's archive clock that far off the guide's.
 */
export function forM3u(
  liveUrl: string, type: string | undefined, source: string | undefined,
  startMs: number, endMs: number, tz?: string, correctionMin = 0, nowMs: number = Date.now(),
): string | null {
  const template = source && source.trim() !== "" ? source : undefined;
  const kind = type?.trim().toLowerCase() || undefined;
  const shift = correctionMin * 60_000;
  const start = startMs + shift;
  const end = endMs + shift;
  if (template !== undefined && kind === "append") return joinQuery(liveUrl, fromTemplate(template, start, end, nowMs, tz));
  if (template !== undefined) return fromTemplate(template, start, end, nowMs, tz);
  if (kind === "shift" || kind === "timeshift" || kind === "default") return joinQuery(liveUrl, fromTemplate(SHIFT_TEMPLATE, start, end, nowMs));
  if (kind !== undefined && kind.startsWith("flussonic")) return flussonic(liveUrl, start, end);
  if (kind === "xc" || kind === "xtream") return xtreamStyle(liveUrl, start, end, tz);
  return null;
}

const TIMESHIFT_PATH = /^(.+?)\/timeshift\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/([^/.]+)\.(?:ts|m3u8)$/i;

/** A path segment re-encoded as a query value (`+` stays a plus, as a path means it). */
function queryValue(segment: string): string {
  let decoded = segment;
  try { decoded = decodeURIComponent(segment); } catch { /* keep it as it is */ }
  return encodeURIComponent(decoded).replace(/%20/g, "+");
}

/**
 * The path form of an Xtream archive URL (`…/timeshift/user/pass/duration/start/id.ts`) in the PHP
 * query form some panels need instead. Null for anything else.
 */
export function timeshiftPhpAlternate(url: string | null | undefined): string | null {
  const g = url ? TIMESHIFT_PATH.exec(url) : null;
  if (!g) return null;
  return `${g[1]}/streaming/timeshift.php?username=${queryValue(g[2] as string)}&password=${queryValue(g[3] as string)}&stream=${g[6]}&start=${g[5]}&duration=${g[4]}`;
}

/** What [archiveUrl] needs from a channel (a parsed M3U entry). */
export interface ArchiveChannel {
  url: string;
  catchupDays?: number;
  catchupType?: string;
  catchupSource?: string;
  catchupCorrectionMin?: number;
}

/** Whether [channel] keeps the programme [startMs]..[stopMs]: already over, and within its archive days. */
export function hasArchive(channel: ArchiveChannel, startMs: number, stopMs: number, nowMs: number = Date.now()): boolean {
  const days = channel.catchupDays ?? 0;
  if (days <= 0 || stopMs > nowMs) return false;
  return startMs >= nowMs - days * 86_400_000;
}

/**
 * The archive address of the programme [startMs]..[stopMs] on [channel], or null when the channel keeps
 * none for it. A channel that only says how many days it keeps (an Xtream panel's own M3U usually gives
 * nothing more) is asked through the panel's timeshift endpoint when its URL has the Xtream shape.
 */
export function archiveUrl(channel: ArchiveChannel, startMs: number, stopMs: number, nowMs: number = Date.now(), tz?: string): string | null {
  if (!hasArchive(channel, startMs, stopMs, nowMs)) return null;
  const correction = channel.catchupCorrectionMin ?? 0;
  const built = forM3u(channel.url, channel.catchupType, channel.catchupSource, startMs, stopMs, tz, correction, nowMs);
  if (built !== null) return built;
  if (channel.catchupType === undefined && channel.catchupSource === undefined) {
    return xtreamStyle(channel.url, startMs + correction * 60_000, stopMs + correction * 60_000, tz);
  }
  return null;
}
