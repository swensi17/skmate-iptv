// Films and series, after the Android app: what an M3U holds (entries tagged by parseM3U), an Xtream login's
// player_api.php, and the rules both share — episode names, episode numbering, watching order, what counts as watched.
import type { Channel } from "./m3u/parse";

export interface VodCategory { id: string; name: string }

export interface Movie {
  id: string;
  name: string;
  /** A category id of the library it came from. */
  category: string;
  /** The address to play; a Stalker one is minted on opening (see the Windows app). */
  url: string;
  poster?: string;
  plot?: string;
  rating?: number;
  year?: number;
  /** Milliseconds since 1970. */
  addedAt?: number;
  headers?: Record<string, string>;
}

export interface Show {
  id: string;
  name: string;
  category: string;
  poster?: string;
  plot?: string;
  rating?: number;
  year?: number;
  addedAt?: number;
}

export interface Episode {
  id: string;
  season: number;
  episode: number;
  /** "" when the provider gives none: the screen shows the number. */
  title: string;
  url: string;
  headers?: Record<string, string>;
}

/** Watched once 95 % of it has been seen; resume is offered from 10 s on (Android's MovieViewModel, planner). */
export const WATCHED_FRACTION = 0.95;
export const RESUME_MIN_MS = 10_000;
/** Seconds a press of Left or Right winds a film (Android's default seek step). */
export const VOD_SEEK_STEP_S = 10;
/** The next episode starts this long before the end, its card shows this long before that (PlayerHud). */
export const NEXT_EPISODE_AT_END_MS = 8_000;
export const NEXT_EPISODE_CARD_MS = 30_000;

export const isWatched = (positionMs: number, durationMs: number): boolean => durationMs > 0 && positionMs >= durationMs * WATCHED_FRACTION;
export const canResume = (positionMs: number, durationMs: number): boolean => positionMs >= RESUME_MIN_MS && !isWatched(positionMs, durationMs);

// --- Episode names (Android's parseM3uEpisode and its tests) ---

const SXXEYY = /\bS(\d{1,4})\s*[.\-_ ]?\s*E(\d{1,4})\b/i;
const WORDS = /\bSeason\s*(\d{1,4})\s*[.,:\-_ ]*\s*(?:Episode|Ep\.?)\s*(\d{1,4})\b/i;
const NXN = /\b(\d{1,2})x(\d{1,3})\b/i;
const trimMarks = (s: string): string => s.replace(/^[ \-._:]+|[ \-._:]+$/g, "");

/** "Stranger Things S01E05 - The Flea…" → show, season 1, episode 5, its title; no marker → season 1, episode 0. */
export function parseEpisodeName(name: string): { show: string; season: number; episode: number; title: string | null } {
  for (const re of [SXXEYY, WORDS, NXN]) {
    const m = re.exec(name);
    if (!m) continue;
    const show = trimMarks(name.slice(0, m.index));
    if (show === "") continue;
    const title = trimMarks(name.slice(m.index + m[0].length));
    return { show, season: Number(m[1]), episode: Number(m[2]), title: title || null };
  }
  return { show: trimMarks(name), season: 1, episode: 0, title: null };
}

/** An episode the provider numbered 0 takes its place in its season (Android's numberBlankEpisodes). */
export function numberBlankEpisodes<T extends { season: number; episode: number }>(episodes: readonly T[]): T[] {
  const position = new Map<number, number>();
  return episodes.map((e) => {
    const p = (position.get(e.season) ?? 0) + 1;
    position.set(e.season, p);
    return e.episode > 0 ? e : { ...e, episode: p };
  });
}

/** Watching order: the regular seasons in turn, the Specials (season 0) after them (Android's EpisodeOrder). */
const rank = (season: number): number => (season === 0 ? Number.MAX_SAFE_INTEGER : season);
export function inWatchingOrder<T extends { season: number; episode: number }>(episodes: readonly T[]): T[] {
  return [...episodes].sort((a, b) => rank(a.season) - rank(b.season) || a.episode - b.episode);
}
export const seasonsOf = (episodes: readonly { season: number }[]): number[] =>
  [...new Set(episodes.map((e) => e.season))].sort((a, b) => rank(a) - rank(b));

/** The episode after [current] in watching order, or null after the last. */
export function nextEpisode<T extends { id: string; season: number; episode: number }>(episodes: readonly T[], current: string): T | null {
  const order = inWatchingOrder(episodes);
  const i = order.findIndex((e) => e.id === current);
  return i >= 0 ? order[i + 1] ?? null : null;
}

// --- An M3U's films and series ---

export interface Library {
  movies: Movie[];
  movieCategories: VodCategory[];
  shows: Show[];
  showCategories: VodCategory[];
  /** Episodes of each show, in watching order. */
  episodes: Map<string, Episode[]>;
}

const categoriesOf = (groups: Iterable<string>): VodCategory[] => [...new Set(groups)].map((g) => ({ id: g, name: g }));

/** The films and series of a parsed M3U: categories from `group-title`, shows by name, seasons from the names. */
export function m3uLibrary(entries: readonly Channel[]): Library {
  const movies: Movie[] = [];
  const shows = new Map<string, Show>();
  const episodes = new Map<string, Episode[]>();
  for (const c of entries) {
    if (c.media === "movie") {
      movies.push({ id: c.id, name: c.name, category: c.group, url: c.url, ...(c.logo ? { poster: c.logo } : {}), ...(c.headers ? { headers: c.headers } : {}) });
    } else if (c.media === "series") {
      const e = parseEpisodeName(c.name);
      const key = e.show.toLowerCase();
      if (!shows.has(key)) shows.set(key, { id: key, name: e.show, category: c.group, ...(c.logo ? { poster: c.logo } : {}) });
      const list = episodes.get(key) ?? [];
      list.push({ id: c.id, season: e.season, episode: e.episode, title: e.title ?? "", url: c.url, ...(c.headers ? { headers: c.headers } : {}) });
      episodes.set(key, list);
    }
  }
  for (const [k, list] of episodes) episodes.set(k, inWatchingOrder(numberBlankEpisodes(list)));
  return {
    movies, movieCategories: categoriesOf(movies.map((m) => m.category)),
    shows: [...shows.values()], showCategories: categoriesOf([...shows.values()].map((s) => s.category)), episodes,
  };
}

// --- Xtream Codes (player_api.php) ---

export interface XtreamAccount { base: string; user: string; pass: string }

/** The login inside an Xtream M3U link (`get.php?username=&password=`), or null for any other link. */
export function xtreamAccount(url: string): XtreamAccount | null {
  try {
    const u = new URL(url);
    if (!/\/get\.php$/i.test(u.pathname)) return null;
    const user = u.searchParams.get("username");
    const pass = u.searchParams.get("password");
    return user && pass ? { base: `${u.protocol}//${u.host}`, user, pass } : null;
  } catch {
    return null;
  }
}

export function xtreamApiUrl(a: XtreamAccount, action: string, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ username: a.user, password: a.pass, action, ...extra });
  return `${a.base}/player_api.php?${q.toString().replace(/\+/g, "%20")}`;
}

/** A path segment as Android writes it: `p#ss/w?rd%1` → `p%23ss%2Fw%3Frd%251`, a space as `%20`. */
const segment = (s: string): string => encodeURIComponent(s);
export const xtreamMovieUrl = (a: XtreamAccount, id: string, ext?: string): string =>
  `${a.base}/movie/${segment(a.user)}/${segment(a.pass)}/${id}.${ext || "mp4"}`;
export const xtreamEpisodeUrl = (a: XtreamAccount, id: string, ext?: string): string =>
  `${a.base}/series/${segment(a.user)}/${segment(a.pass)}/${id}.${ext || "mp4"}`;

type Json = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" ? (v.trim() || undefined) : typeof v === "number" ? String(v) : undefined);
const num = (v: unknown): number | undefined => { const n = Number(str(v)); return Number.isFinite(n) && n > 0 ? n : undefined; };
/** Seconds or milliseconds since 1970 as milliseconds: below 1e10 it is seconds. */
const time = (v: unknown): number | undefined => { const n = num(v); return n === undefined ? undefined : n < 1e10 ? n * 1000 : n; };
const yearOf = (v: unknown): number | undefined => { const m = /\d{4}/.exec(str(v) ?? ""); const y = m ? Number(m[0]) : 0; return y >= 1900 && y <= 2100 ? y : undefined; };
const rows = (v: unknown): Json[] => (Array.isArray(v) ? v.filter((x): x is Json => !!x && typeof x === "object") : []);
/** [fn]'s lists one after another (no Array.flatMap: the core runs on 2018 TV browsers). */
function flat<A, B>(list: readonly A[], fn: (a: A) => B[]): B[] {
  const out: B[] = [];
  for (const a of list) out.push(...fn(a));
  return out;
}
function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as Array<keyof T>) if (o[k] === undefined) delete o[k];
  return o;
}

export function parseXtreamCategories(json: unknown): VodCategory[] {
  return flat(rows(json), (c) => { const id = str(c.category_id); const name = str(c.category_name); return id && name ? [{ id, name }] : []; });
}

export function parseXtreamMovies(json: unknown, a: XtreamAccount): Movie[] {
  return flat(rows(json), (m) => {
    const id = str(m.stream_id);
    const name = str(m.name);
    if (!id || !name) return [];
    return [compact({
      id, name, category: str(m.category_id) ?? "", url: xtreamMovieUrl(a, id, str(m.container_extension)),
      poster: str(m.stream_icon), plot: str(m.plot) ?? str(m.description), rating: num(m.rating), year: yearOf(m.year ?? m.releasedate), addedAt: time(m.added),
    } as Movie)];
  });
}

export function parseXtreamShows(json: unknown): Show[] {
  return flat(rows(json), (s) => {
    const id = str(s.series_id);
    const name = str(s.name);
    if (!id || !name) return [];
    return [compact({
      id, name, category: str(s.category_id) ?? "", poster: str(s.cover), plot: str(s.plot), rating: num(s.rating),
      year: yearOf(s.year ?? s.releaseDate ?? s.release_date), addedAt: time(s.last_modified) ?? time(s.added),
    } as Show)];
  });
}

/** `get_series_info`'s episodes in every shape panels send: keyed by season, one flat list, or a list per season. */
export function parseXtreamEpisodes(json: unknown, a: XtreamAccount): Episode[] {
  const raw = (json as Json | null)?.episodes;
  const out: Array<{ e: Json; season: number }> = [];
  const take = (list: unknown, season: number | null) => {
    for (const e of rows(list)) out.push({ e, season: (num(e.season) ?? season ?? 1) });
  };
  if (Array.isArray(raw)) {
    if (raw.every((x) => Array.isArray(x))) raw.forEach((list, i) => take(list, i + 1));
    else take(raw, null);
  } else if (raw && typeof raw === "object") {
    for (const [k, list] of Object.entries(raw as Json)) {
      if (!/^\d+$/.test(k)) continue;
      take(Array.isArray(list) ? list : list && typeof list === "object" ? Object.values(list as Json) : [], Number(k));
    }
  }
  const eps = flat(out, ({ e, season }) => {
    const id = str(e.id);
    if (!id) return [];
    return [{ id, season, episode: num(e.episode_num) ?? 0, title: str(e.title) ?? "", url: xtreamEpisodeUrl(a, id, str(e.container_extension)) }];
  });
  return inWatchingOrder(numberBlankEpisodes(eps));
}
