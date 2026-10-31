import type { Channel } from "@skmate/core";
import { scoped } from "./scope";

const KEY = "skmate.favorites.v1";

/** The same channel across reloads: its tvg-id, or name and link together (one stream can sit under two names). */
export const channelKey = (c: Channel): string => c.tvgId ?? `${c.name}|${c.url}`;

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
