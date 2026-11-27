import type { Channel } from "@skmate/core";
import { scoped } from "./scope";

const KEY = "skmate.favorites.v1";

/** The same channel across reloads: its tvg-id, or name and link together (one stream can sit under two names). */
export const channelKey = (c: Channel): string => c.tvgId ?? `${c.name}|${c.url}`;

/**
 * The favourite's own key (2.6.2): the tvg-id with the name, so the HD, SD and +2 copies of one guide channel are
 * favourites each on their own; one heart never lights several channels.
 */
export const favKey = (c: Channel): string => (c.tvgId ? `${c.tvgId}|${c.name}` : `${c.name}|${c.url}`);

export const isFavorite = (favs: ReadonlySet<string>, c: Channel): boolean => favs.has(favKey(c));

/**
 * Favourites saved before 2.6.2 by the tvg-id alone: each goes to the first channel of the playlist with that
 * tvg-id, the one it stood for in the list. A key no channel has (another playlist's) is kept as it is.
 */
export function migrateFavorites(favs: ReadonlySet<string>, channels: readonly Channel[]): Set<string> | null {
  const byTvg = new Map<string, Channel>();
  for (const c of channels) if (c.tvgId && !byTvg.has(c.tvgId)) byTvg.set(c.tvgId, c);
  let changed = false;
  const next = new Set<string>();
  for (const k of favs) {
    const c = byTvg.get(k);
    if (c) { next.add(favKey(c)); changed = true; } else next.add(k);
  }
  return changed ? next : null;
}

export function toggle(favs: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(favs);
  if (!next.delete(key)) next.add(key);
  return next;
}

export function loadFavorites(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(scoped(KEY)) ?? "[]") as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveFavorites(favs: ReadonlySet<string>): void {
  try { localStorage.setItem(scoped(KEY), JSON.stringify(Array.from(favs))); } catch { /* not persisted */ }
}
