import type { Channel } from "@skmate/core";
import { channelKey } from "./favorites";
import { scoped } from "./scope";

const KEY = "skmate.history.v1";
export const MAX_RECENT = 50;

/** [key] goes to the front of the list; an earlier entry of it is dropped, the list is capped. */
export function pushRecent(list: readonly string[], key: string, max = MAX_RECENT): string[] {
  return [key, ...list.filter((k) => k !== key)].slice(0, max);
}

/** The recently watched channels that are still in the playlist, the latest first. */
export function recentChannels(channels: readonly Channel[], keys: readonly string[]): Channel[] {
  const byKey = new Map<string, Channel>();
  for (const c of channels) if (!byKey.has(channelKey(c))) byKey.set(channelKey(c), c);
  const out: Channel[] = [];
  for (const k of keys) { const c = byKey.get(k); if (c) out.push(c); }
  return out;
}

export function loadHistory(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(scoped(KEY)) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function saveHistory(list: readonly string[]): void {
  try { localStorage.setItem(scoped(KEY), JSON.stringify(list)); } catch { /* not remembered */ }
}
