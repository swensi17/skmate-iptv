export interface PlaylistEntry { id: string; name: string; url: string }

import { scoped } from "./scope";

const KEY = "skmate.playlists.v1";

/** A readable name from a link: the host, or the last path segment when it says more. */
export function nameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const base = last.replace(/\.[a-z0-9]{2,4}$/i, "");
    return base.length > 2 && !/^(playlist|get|index)$/i.test(base) ? `${u.hostname} / ${base}` : u.hostname;
  } catch {
    return url;
  }
}

/** Accepts only http(s) links; everything else is not a playlist the TV can fetch. */
export function normalizeUrl(input: string): string | null {
  const s = input.trim();
  if (s === "") return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `http://${s}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * An Xtream Codes login as the provider's own M3U link (`get.php`, `m3u_plus` with groups, logos and guide ids,
 * HLS streams the TV plays natively). Null when the server is not an http(s) address or a field is empty.
 * The server may be given with its port and with any page of the panel: only the address and the port are kept.
 */
export function xtreamUrl(server: string, username: string, password: string): string | null {
  const base = normalizeUrl(server);
  if (!base || username.trim() === "" || password.trim() === "") return null;
  const u = new URL(base);
  const q = `username=${encodeURIComponent(username.trim())}&password=${encodeURIComponent(password.trim())}`;
  return `${u.protocol}//${u.host}/get.php?${q}&type=m3u_plus&output=m3u8`;
}

/** The guide an Xtream server serves for the same login (`xmltv.php`), or null when [url] is no Xtream link. */
export function xtreamGuide(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/\/get\.php$/i.test(u.pathname)) return null;
    const user = u.searchParams.get("username");
    const pass = u.searchParams.get("password");
    if (!user || !pass) return null;
    return `${u.protocol}//${u.host}/xmltv.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
  } catch {
    return null;
  }
}

/** Adds a playlist; the same link twice is one playlist. */
export function addPlaylist(list: readonly PlaylistEntry[], url: string, name?: string): PlaylistEntry[] {
  if (list.some((p) => p.url === url)) return [...list];
  const id = String(Math.max(0, ...list.map((p) => Number(p.id) || 0)) + 1);
  return [...list, { id, name: name?.trim() || nameFromUrl(url), url }];
}

export function removePlaylist(list: readonly PlaylistEntry[], id: string): PlaylistEntry[] {
  return list.filter((p) => p.id !== id);
}

/** After a removal the active playlist stays, or falls to the first one that is left. */
export function nextActive(list: readonly PlaylistEntry[], activeId: string | null): string | null {
  return list.some((p) => p.id === activeId) ? activeId : list[0]?.id ?? null;
}

export interface PlaylistStore { list: PlaylistEntry[]; activeId: string | null }

export function loadStore(): PlaylistStore {
  try {
    const raw = JSON.parse(localStorage.getItem(scoped(KEY)) ?? "null") as Partial<PlaylistStore> | null;
    const list = Array.isArray(raw?.list) ? raw.list.filter((p) => p && typeof p.url === "string") : [];
    return { list, activeId: nextActive(list, raw?.activeId ?? null) };
  } catch {
    return { list: [], activeId: null };
  }
}

export function saveStore(s: PlaylistStore): void {
  try { localStorage.setItem(scoped(KEY), JSON.stringify(s)); } catch { /* the list just does not persist */ }
}

/** A link passed as `?playlist=…` in the address: how a launcher or a developer opens the app on a given playlist. */
export function playlistFromSearch(search: string): string | null {
  const m = /[?&]playlist=([^&]+)/.exec(search);
  if (!m) return null;
  try { return normalizeUrl(decodeURIComponent(m[1] as string)); } catch { return null; }
}
