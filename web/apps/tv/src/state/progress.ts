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

/**
 * Up to 2.6.9 a film or an episode of an M3U playlist was known by its place in the list ("0", "1", …); now by a
 * lasting id (parseM3U). Once, before the playlist is read from its link again, the places kept here are turned into
 * the new ids through the copy of that very list kept on this device: the n-th entry of [entriesOf](playlist) is the
 * one that had id "n". Xtream and Stalker keep their own ids and are left alone; a place with no copy to read is too.
 */
export function migrateProgressIds(book: Book, playlists: ReadonlyArray<{ id: string; m3u: boolean }>, entriesOf: (playlistId: string) => ReadonlyArray<{ id: string }> | null): Book | null {
  const lists = new Map<string, ReadonlyArray<{ id: string }> | null>();
  const listOf = (pid: string) => { if (!lists.has(pid)) lists.set(pid, entriesOf(pid)); return lists.get(pid) ?? null; };
  const m3u = new Set(playlists.filter((p) => p.m3u).map((p) => p.id));
  const re = (pid: string, id: string | undefined): string | undefined => {
    if (id === undefined || !/^\d+$/.test(id)) return id;
    return listOf(pid)?.[Number(id)]?.id ?? id;
  };
  let changed = false;
  const out: Book = {};
  for (const [key, p] of Object.entries(book)) {
    const [pid, kind, id] = key.split("|") as [string, string, string];
    if (!m3u.has(pid) || !listOf(pid)) { out[key] = p; continue; }
    const next: Progress = { ...p };
    if (p.kind === "movie") {
      next.itemId = re(pid, p.itemId) as string;
      next.item = { ...p.item, id: re(pid, p.item.id) as string };
    } else {
      next.episodeId = re(pid, p.episodeId);
    }
    const nk = `${pid}|${kind}|${re(pid, id)}`;
    if (nk !== key || JSON.stringify(next) !== JSON.stringify(p)) changed = true;
    out[nk] = next;
  }
  return changed ? out : null;
}

const MIGRATED = "skmate.progress.ids2";

/** Runs [migrateProgressIds] once per profile, on the copies kept on this device. */
export function migrateStoredProgress(playlists: ReadonlyArray<{ id: string; m3u: boolean }>, entriesOf: (playlistId: string) => ReadonlyArray<{ id: string }> | null): void {
  try {
    if (localStorage.getItem(scoped(MIGRATED))) return;
    const next = migrateProgressIds(loadProgress(), playlists, entriesOf);
    if (next) localStorage.setItem(scoped(KEY), JSON.stringify(next));
    localStorage.setItem(scoped(MIGRATED), "1");
  } catch { /* tried again at the next start */ }
}
