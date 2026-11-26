import { useEffect, useState } from "preact/hooks";

/*
 * The poster and the "what it is about" of a film or a series on air, from TMDB (Android 2.5.3 ProgrammeArtLookup.kt,
 * ProgrammeArtView.kt rememberProgrammeArt, 2.5.4 peek / posters switch). Light by design: one search per title (no
 * details call), answers and misses kept for the run of the app, news, sport and talk shows never asked. A guess that
 * is not close enough shows nothing rather than a wrong film.
 *
 * The key: the viewer's own (Settings › metadata), else SkMate's, put into the build from a secret
 * (VITE_SKMATE_TMDB_KEY, see web/README.md) and never kept in the repository. With neither, nothing is asked.
 * The built-in key is metered per TV as Android's MetadataBudget meters the shared one: 40 a minute, 150 an hour,
 * 400 a day. A key of the viewer's own is theirs and is not metered.
 */

export type ArtKind = "movie" | "tv";

/** What TMDB knows about a programme on air. */
export interface ProgrammeArt {
  /** The small poster for the lists and the info (w185: a 96–120 wide poster on a weak TV needs no more). */
  posterUrl: string;
  title: string;
  year: number | null;
  overview: string | null;
  type: ArtKind;
}

/** The settings the lookup reads (Settings: metadata on, own key, language; the posters switch). */
export interface ArtSettings {
  metadataOn: boolean;
  tmdbKey: string;
  tmdbLanguage: string;
  programmePosters: boolean;
}

export const IMAGE_BASE = "https://image.tmdb.org/t/p";
const API_BASE = "https://api.themoviedb.org";
/** Smaller than Android's w342: the posters are drawn 96 and 120 wide, and a TV decodes every pixel of a JPEG. */
const POSTER_SIZE = "w185";
/** The whole-screen look (Android w780): w500 still fills the 86 % high viewer of a 1080p TV, at a third of the bytes. */
const LARGE_SIZE = "w500";
export const largePosterUrl = (a: ProgrammeArt): string => a.posterUrl.replace(`/${POSTER_SIZE}/`, `/${LARGE_SIZE}/`);

/* ---------- ProgrammeTitle.parse: a guide title made searchable ---------- */

const MOVIE_MARK = /^\s*(?:х\/ф|х\.ф\.|худ\.\s*фильм|м\/ф|фильм|кино)\s*/i;
const TV_MARK = /^\s*(?:т\/с|т\.с\.|м\/с|сериал|телесериал|мультсериал)\s*/i;
const DOC_MARK = /^\s*(?:д\/ф|д\/с|док\.\s*фильм)\s*/i;
const AGE = /[[(]?\b\d{1,2}\+[\])]?/g;
const BRACKETS = /\s*[([][^)\]]*[)\]]/g;
const EPISODE = /(?:[.,:\s-]+(?:\d+\s*(?:-?я|-?й)?\s*)?(?:серия|сезон|выпуск|часть|эпизод|episode|season|part).*$)|(?:[.,:]\s*\d+\s*$)/i;
const QUOTES = /[«»"„“”]/g;
const NOT_FILMS = [
  "новост", "вести", "известия", "время", "сегодня", "утро", "погода", "спорт", "футбол", "хоккей",
  "теннис", "матч", "шоу", "телемагазин", "реклама", "прямой эфир", "в эфире", "итоги", "ток",
  "минут", "пусть говорят", "малахов", "место встречи", "news", "live", "weather", "sport",
];

export interface ProgrammeTitle { title: string; kind: ArtKind | null }

/**
 * "Х/ф «Брат 2» (16+)" → "Брат 2", a film; the age mark, the episode and anything in brackets are dropped. News,
 * sport, talk shows and the like are never films: null for them, and for a documentary.
 */
export function parseProgrammeTitle(raw: string): ProgrammeTitle | null {
  let t = raw.trim();
  let kind: ArtKind | null = null;
  if (MOVIE_MARK.test(t)) { kind = "movie"; t = t.replace(MOVIE_MARK, ""); }
  else if (TV_MARK.test(t)) { kind = "tv"; t = t.replace(TV_MARK, ""); }
  if (DOC_MARK.test(t)) return null;
  t = t.replace(AGE, " ").replace(BRACKETS, "").replace(QUOTES, "").replace(EPISODE, "")
    .replace(/\s+/g, " ").trim().replace(/[.,:\- ]+$/, "");
  if (t.length < 2) return null;
  const lower = t.toLowerCase();
  if (kind === null && NOT_FILMS.some((w) => lower.includes(w))) return null;
  return { title: t, kind };
}

/* ---------- TitleMatchScorer ---------- */

/** Spellings that differ only on paper: ё as е, and Latin look-alikes in a Cyrillic title as Cyrillic. */
const LOOK_ALIKES: Record<string, string> = { a: "а", e: "е", o: "о", p: "р", c: "с", x: "х", y: "у" };
export function fold(text: string): string {
  const lower = text.toLowerCase().replace(/ё/g, "е");
  return /[а-я]/.test(lower) ? lower.replace(/[aeopcxy]/g, (ch) => LOOK_ALIKES[ch] ?? ch) : lower;
}

function tokenOverlap(a: string, b: string): number {
  const left = new Set(a.split(/\s+/).filter(Boolean));
  const right = new Set(b.split(/\s+/).filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let both = 0;
  left.forEach((w) => { if (right.has(w)) both++; });
  return both / (left.size + right.size - both);
}

function similarity(query: string, candidate: string): number {
  const title = candidate.toLowerCase().trim();
  if (!query.trim() || !title) return 0;
  if (query === title) return 1;
  if (title.includes(query) || query.includes(title)) return 0.75;
  return tokenOverlap(query, title);
}

/** TitleMatchScorer.score without a year (a guide title has none). */
export function titleScore(query: string, localized: string, original: string | null): number {
  const q = query.toLowerCase().trim();
  return Math.max(0, Math.min(1, Math.max(similarity(q, localized), original ? similarity(q, original) : 0)));
}

/** Without "film" or "series" in the guide the title alone decides, so it has to match all but exactly. */
const EXACT_SCORE = 0.99;
const HINTED_SCORE = 0.74;

interface Result { type: ArtKind; title: string; original: string | null; year: number | null; overview: string | null; poster: string | null; popularity: number }

/** TmdbProvider.parseResults: a search answer as candidates (adult ones are never taken). */
export function parseResults(type: ArtKind, body: unknown): Result[] {
  const results = (body as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(results)) return [];
  const out: Result[] = [];
  for (const r of results) {
    const o = r as Record<string, unknown>;
    if (!o || o.adult === true || !o.id) continue;
    const str = (k: string) => (typeof o[k] === "string" && o[k] !== "" && o[k] !== "null" ? (o[k] as string) : null);
    const date = str(type === "tv" ? "first_air_date" : "release_date");
    const year = date ? parseInt(date.slice(0, 4), 10) : NaN;
    out.push({
      type, title: str(type === "tv" ? "name" : "title") ?? "?", original: str(type === "tv" ? "original_name" : "original_title"),
      year: Number.isFinite(year) ? year : null, overview: str("overview"), poster: str("poster_path"),
      popularity: typeof o.popularity === "number" ? o.popularity : 0,
    });
  }
  return out;
}

/** The best candidate close enough to [q], posters only; the more popular one between two equally close. */
export function bestMatch(q: ProgrammeTitle, lists: readonly Result[][]): ProgrammeArt | null {
  const needed = q.kind === null ? EXACT_SCORE : HINTED_SCORE;
  let best: { r: Result; s: number } | null = null;
  for (const list of lists) {
    for (const r of list) {
      if (!r.poster) continue;
      const s = titleScore(fold(q.title), fold(r.title), r.original ? fold(r.original) : null);
      if (s < needed) continue;
      if (!best || s > best.s || (s === best.s && r.popularity > best.r.popularity)) best = { r, s };
    }
  }
  if (!best) return null;
  const r = best.r;
  return { posterUrl: `${IMAGE_BASE}/${POSTER_SIZE}${r.poster}`, title: r.title, year: r.year, overview: r.overview, type: r.type };
}

/* ---------- The key, the allowance, the lookup ---------- */

/** SkMate's key, put in at build time (never in the repo); "" when the build has none. Letters and digits only. */
const BUILT_IN_KEY = String((import.meta.env as Record<string, string | undefined>).VITE_SKMATE_TMDB_KEY ?? "").replace(/[^A-Za-z0-9]/g, "");

/** The key to ask with, and whether it is the shared one (metered); null: no key, nothing is asked. */
export function keyFor(s: Pick<ArtSettings, "tmdbKey">, builtIn: string = BUILT_IN_KEY): { key: string; metered: boolean } | null {
  const own = s.tmdbKey.trim();
  if (own) return { key: own, metered: false };
  return builtIn ? { key: builtIn, metered: true } : null;
}

const BUDGET_KEY = "skmate.tmdbBudget.v1";
const LIMITS: Array<[string, number, number]> = [["m", 60_000, 40], ["h", 3_600_000, 150], ["d", 86_400_000, 400]];

/** Android MetadataBudget: fixed windows kept in storage, so a restart does not reset the allowance. */
export function spend(store: Pick<Storage, "getItem" | "setItem"> | null, now: number = Date.now()): boolean {
  let b: Record<string, [number, number]> = {};
  try { b = JSON.parse(store?.getItem(BUDGET_KEY) ?? "{}") as Record<string, [number, number]>; } catch { b = {}; }
  for (const [k, span, limit] of LIMITS) {
    const w = b[k];
    const start = Math.floor(now / span) * span;
    if (!w || w[0] !== start) b[k] = [start, 0];
    if ((b[k] as [number, number])[1] >= limit) return false;
  }
  for (const [k] of LIMITS) (b[k] as [number, number])[1]++;
  try { store?.setItem(BUDGET_KEY, JSON.stringify(b)); } catch { /* full: the window holds for this run */ }
  return true;
}

const CACHE_SIZE = 300;
/** Answers and misses for the run of the app, by language, kind and title; the oldest go first. */
const cache = new Map<string, ProgrammeArt | null>();
/** Calls in flight, so two screens asking for one title ask TMDB once. */
const pending = new Map<string, Promise<ProgrammeArt | null | undefined>>();

const keyOf = (lang: string, q: ProgrammeTitle) => `${lang}|${q.kind ?? ""}|${q.title.toLowerCase()}`;
const uiLanguage = () => (typeof document !== "undefined" && document.documentElement.lang) || "en";
const langFor = (s: ArtSettings) => s.tmdbLanguage.trim() || uiLanguage();

/** The art for [title] if it was already found in this run, without asking anyone (2.5.4 peek). */
export function peekArt(title: string | null | undefined, s: ArtSettings): ProgrammeArt | null {
  if (!title || !s.metadataOn) return null;
  const q = parseProgrammeTitle(title);
  return q ? cache.get(keyOf(langFor(s), q)) ?? null : null;
}

async function search(type: ArtKind, q: string, lang: string, key: string): Promise<Result[] | null> {
  const url = `${API_BASE}/3/search/${type}?query=${encodeURIComponent(q)}&include_adult=false&language=${encodeURIComponent(lang)}&api_key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null; // a limit or a server error says nothing: asked again later, never kept as a miss
    return parseResults(type, await res.json());
  } catch {
    return null;
  }
}

/** The art for a programme titled [title], null when it is not a film or series TMDB knows; undefined: ask later. */
export async function lookupArt(title: string, s: ArtSettings): Promise<ProgrammeArt | null | undefined> {
  if (!s.metadataOn) { cache.clear(); return null; }
  const q = parseProgrammeTitle(title);
  if (!q) return null;
  const lang = langFor(s);
  const k = keyOf(lang, q);
  if (cache.has(k)) { const v = cache.get(k) ?? null; cache.delete(k); cache.set(k, v); return v; }
  const key = keyFor(s);
  if (!key) return null;
  const running = pending.get(k);
  if (running) return running;
  const work = (async () => {
    const types: ArtKind[] = q.kind === "movie" ? ["movie"] : q.kind === "tv" ? ["tv"] : ["tv", "movie"];
    if (key.metered && !types.every(() => spend(typeof localStorage !== "undefined" ? localStorage : null))) return undefined;
    const lists = await Promise.all(types.map((t) => search(t, q.title, lang, key.key)));
    // A call that failed (a dropped connection) says nothing: the title is asked again later.
    if (lists.some((l) => l === null)) return undefined;
    const found = bestMatch(q, lists as Result[][]);
    cache.set(k, found);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
    return found;
  })();
  pending.set(k, work);
  try { return await work; } finally { pending.delete(k); }
}

/** Focus rests this long on a programme before it is looked up: a held key passing channels asks nothing. */
const ART_SETTLE_MS = 450;

/**
 * rememberProgrammeArt: the art of the programme titled [title], once focus has rested on it; a title seen before
 * comes straight from memory. Kept with the title it was found for, so another programme's poster never stays on
 * screen, not even for a frame. Null with the posters switched off (Settings › Film posters) or TMDB off.
 */
export function useProgrammeArt(title: string | null | undefined, s: ArtSettings): ProgrammeArt | null {
  const known = peekArt(title, s);
  const [found, setFound] = useState<{ title: string | null | undefined; art: ProgrammeArt | null }>({ title, art: known });
  const lang = langFor(s);
  useEffect(() => {
    setFound({ title, art: known });
    if (!title || !s.metadataOn) return;
    let live = true;
    const id = setTimeout(() => {
      void lookupArt(title, s).then((art) => { if (live && art !== undefined) setFound({ title, art }); });
    }, known ? 0 : ART_SETTLE_MS);
    return () => { live = false; clearTimeout(id); };
  }, [title, lang, s.metadataOn, s.tmdbKey]);
  if (!s.programmePosters || !s.metadataOn) return null;
  return found.title === title ? found.art : known;
}
