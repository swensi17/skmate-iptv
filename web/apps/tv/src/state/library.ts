import {
  isAdultCategory, m3uLibrary, parseXtreamCategories, parseXtreamEpisodes, parseXtreamMovies, parseXtreamShows, xtreamAccount,
  xtreamApiUrl, type Channel, type Episode, type Movie, type Show, type VodCategory, type XtreamAccount,
} from "@skmate/core";
import { desktop } from "./desktop";
import { isStalker } from "./playlists";

export type VodKind = "movie" | "series";

/**
 * Where a playlist's films and series come from, as on Android: an M3U's tagged entries, an Xtream login's
 * player_api.php (posters, plots, seasons), or a Stalker portal through the Windows app. A kids profile sees no
 * adult category here either. Lists are fetched once per playlist; a show's episodes when it is opened.
 */
export interface VodSource {
  categories(kind: VodKind): Promise<VodCategory[]>;
  /** [category] null is every film. */
  movies(category: string | null): Promise<Movie[]>;
  shows(category: string | null): Promise<Show[]>;
  episodes(show: Show): Promise<Episode[]>;
}

const TIMEOUT_MS = 30_000;

async function getJson(url: string): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Keeps the kids' rule: no category whose name is adult, nothing filed under one. */
function kidsSafe(source: VodSource, kids: boolean): VodSource {
  if (!kids) return source;
  const adult = async (kind: VodKind) => new Set((await source.categories(kind)).filter((c) => isAdultCategory(c.name)).map((c) => c.id));
  return {
    categories: async (kind) => (await source.categories(kind)).filter((c) => !isAdultCategory(c.name)),
    movies: async (cat) => { const bad = await adult("movie"); return cat && bad.has(cat) ? [] : (await source.movies(cat)).filter((m) => !bad.has(m.category)); },
    shows: async (cat) => { const bad = await adult("series"); return cat && bad.has(cat) ? [] : (await source.shows(cat)).filter((s) => !bad.has(s.category)); },
    episodes: (show) => source.episodes(show),
  };
}

const once = <T,>(make: () => Promise<T>): (() => Promise<T>) => {
  let p: Promise<T> | null = null;
  return () => { p ??= make().catch((e) => { p = null; throw e; }); return p; };
};
const inCategory = <T extends { category: string }>(list: T[], cat: string | null): T[] => (cat === null ? list : list.filter((x) => x.category === cat));

function m3uSource(entries: readonly Channel[]): VodSource {
  const lib = m3uLibrary(entries);
  return {
    categories: async (kind) => (kind === "movie" ? lib.movieCategories : lib.showCategories),
    movies: async (cat) => inCategory(lib.movies, cat),
    shows: async (cat) => inCategory(lib.shows, cat),
    episodes: async (show) => lib.episodes.get(show.id) ?? [],
  };
}

function xtreamSource(a: XtreamAccount): VodSource {
  const movieCats = once(async () => parseXtreamCategories(await getJson(xtreamApiUrl(a, "get_vod_categories"))));
  const showCats = once(async () => parseXtreamCategories(await getJson(xtreamApiUrl(a, "get_series_categories"))));
  const movies = once(async () => parseXtreamMovies(await getJson(xtreamApiUrl(a, "get_vod_streams")), a));
  const shows = once(async () => parseXtreamShows(await getJson(xtreamApiUrl(a, "get_series"))));
  return {
    categories: (kind) => (kind === "movie" ? movieCats() : showCats()),
    movies: async (cat) => inCategory(await movies(), cat),
    shows: async (cat) => inCategory(await shows(), cat),
    episodes: async (show) => parseXtreamEpisodes(await getJson(xtreamApiUrl(a, "get_series_info", { series_id: show.id })), a),
  };
}

function stalkerSource(stored: string): VodSource {
  const base = once(async () => {
    const m3u = await desktop()?.stalkerPlaylist(stored);
    if (!m3u) throw new Error("no portal");
    return m3u.replace(/playlist\.m3u$/, "");
  });
  const get = async (path: string) => getJson(`${await base()}${path}`);
  const lists = new Map<string, Promise<unknown>>();
  const list = (type: string, cat: string | null) => {
    const key = `${type}|${cat ?? "*"}`;
    if (!lists.has(key)) lists.set(key, get(`vod/list?type=${type}&category=${encodeURIComponent(cat ?? "*")}`).catch((e) => { lists.delete(key); throw e; }));
    return lists.get(key) as Promise<unknown>;
  };
  return {
    categories: async (kind) => (await get(`vod/categories?type=${kind === "movie" ? "vod" : "series"}`)) as VodCategory[],
    movies: async (cat) => (await list("vod", cat)) as Movie[],
    shows: async (cat) => (await list("series", cat)) as Show[],
    episodes: async (show) => (await get(`vod/episodes?show=${encodeURIComponent(show.id)}`)) as Episode[],
  };
}

/** The source for the playlist at [url] with its parsed [entries]; Stalker only in the Windows app. */
export function vodSourceOf(url: string, entries: readonly Channel[], kids: boolean): VodSource | null {
  if (isStalker(url)) return desktop() ? kidsSafe(stalkerSource(url), kids) : null;
  const xt = xtreamAccount(url);
  return kidsSafe(xt ? xtreamSource(xt) : m3uSource(entries), kids);
}
