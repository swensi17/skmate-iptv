import type { Channel } from "@skmate/core";
import { scoped } from "./scope";

const KEY = "skmate.favorites.v1";

/** The same channel across reloads: its tvg-id, or name and link together (one stream can sit under two names). */
export const channelKey = (c: Channel): string => c.tvgId ?? `${c.name}|${c.url}`;

/**
 * The favourite's own key (2.6.2): the channel's name with its stream address, the same channel and no other. A tvg-id
 * is shared by the HD, SD and +2 copies and, at some Xtream providers, by whole groups: keyed by it, one heart lit
 * a dozen channels (LG webOS 6, MusicBox 80s brought 11 more).
 */
export const favKey = (c: Channel): string => `f3|${c.name}|${c.url}`;

export const isFavorite = (favs: ReadonlySet<string>, c: Channel): boolean => favs.has(favKey(c));

/**
 * The saved favourites set to this playlist, once it is in (as Android's UserDataResolver):
 * - a key of a channel that is here stays;
 * - a key whose stream moved (the provider gave the channel another stream id) goes to the one channel of that name;
 * - older keys (2.6.1 by the tvg-id alone, 2.6.2 by the tvg-id and the name) go to the first channel they stood for;
 * - a key that leads to no channel (another playlist's) is kept as it is; never one key to several channels.
 * Null when nothing changed.
 */
const hostOf = (url: string): string => { try { return new URL(url).host; } catch { return ""; } };

export function migrateFavorites(favs: ReadonlySet<string>, channels: readonly Channel[]): Set<string> | null {
  if (channels.length === 0) return null;
  const keys = new Set(channels.map(favKey));
  const byName = new Map<string, Channel[]>();
  const byTvg = new Map<string, Channel>();
  const byTvgName = new Map<string, Channel>();
  for (const c of channels) {
    const list = byName.get(c.name); if (list) list.push(c); else byName.set(c.name, [c]);
    if (c.tvgId) {
      if (!byTvg.has(c.tvgId)) byTvg.set(c.tvgId, c);
      const k = `${c.tvgId}|${c.name}`;
      if (!byTvgName.has(k)) byTvgName.set(k, c);
    }
  }
  let changed = false;
  const next = new Set<string>();
  for (const k of favs) {
    if (keys.has(k)) { next.add(k); continue; }
    let to: Channel | undefined;
    if (k.startsWith("f3|")) {
      const cut = k.indexOf("|", 3) >= 0 ? k.lastIndexOf("|http") : -1;
      const name = cut > 3 ? k.slice(3, cut) : k.slice(3, k.lastIndexOf("|"));
      const host = hostOf(k.slice((cut > 3 ? cut : k.lastIndexOf("|")) + 1));
      // Only within the same provider: another playlist's favourite stays where it is.
      const same = byName.get(name)?.filter((c) => hostOf(c.url) === host);
      if (same && same.length === 1) to = same[0];
    } else {
      to = byTvg.get(k) ?? byTvgName.get(k);
      if (!to) {
        // name|url of a channel with no tvg-id (before 2.6.2 the same as now, without the mark)
        const c = channels.find((x) => `${x.name}|${x.url}` === k);
        if (c) to = c;
      }
    }
    if (to) { next.add(favKey(to)); changed = true; } else next.add(k);
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
