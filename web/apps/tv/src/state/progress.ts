import { canResume, type Movie, type Show } from "@skmate/core";
import { scoped } from "./scope";

const KEY = "skmate.progress.v1";
const KEEP = 300;

/** Where a film or an episode was left, per profile (Android's playback_progress), with what the "Continue" row shows. */
export interface Progress {
  positionMs: number;
  durationMs: number;
  at: number;
  kind: "movie" | "series";
  /** The film, or the show of the episode. */
  itemId: string;
  name: string;
  poster?: string;
  /** The film or the show itself, so "Continue watching" can open its card again. */
  item: Movie | Show;
  /** For an episode: which one, and how to say it ("S1 · E2"). */
  episodeId?: string;
  episodeLabel?: string;
}

type Book = Record<string, Progress>;

export const progressKey = (playlistId: string, kind: "movie" | "series", id: string): string => `${playlistId}|${kind}|${id}`;

export function loadProgress(): Book {
  try { return JSON.parse(localStorage.getItem(scoped(KEY)) ?? "{}") as Book; } catch { return {}; }
}

/** Saves [p] under [key]; only a real position of a known length counts, and the oldest go past [KEEP]. */
export function saveProgress(key: string, p: Progress): void {
  if (!(p.positionMs > 0 && p.durationMs > 0)) return;
  const book = loadProgress();
  book[key] = p;
  const keys = Object.keys(book).sort((a, b) => (book[b]?.at ?? 0) - (book[a]?.at ?? 0));
  for (const k of keys.slice(KEEP)) delete book[k];
  try { localStorage.setItem(scoped(KEY), JSON.stringify(book)); } catch { /* storage full: the place is just not kept */ }
}

/**
 * "Continue watching" of one playlist, the latest first: films between 10 s and 95 %, and for a show its latest
 * episode while unfinished (Android's planner, without "next up").
 */
export function continueWatching(playlistId: string, book: Book = loadProgress(), max = 10): Array<Progress & { key: string }> {
  const latestOfShow = new Map<string, Progress & { key: string }>();
  const out: Array<Progress & { key: string }> = [];
  for (const [key, p] of Object.entries(book)) {
    if (!key.startsWith(`${playlistId}|`)) continue;
    if (p.kind === "movie") { if (canResume(p.positionMs, p.durationMs)) out.push({ ...p, key }); continue; }
    const cur = latestOfShow.get(p.itemId);
    if (!cur || p.at > cur.at) latestOfShow.set(p.itemId, { ...p, key });
  }
  for (const p of latestOfShow.values()) if (canResume(p.positionMs, p.durationMs)) out.push(p);
  return out.sort((a, b) => b.at - a.at).slice(0, max);
}
