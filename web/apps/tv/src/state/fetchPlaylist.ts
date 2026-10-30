export type FetchFailure = "network" | "http" | "invalid" | "timeout";

export class PlaylistError extends Error {
  constructor(readonly kind: FetchFailure, detail?: string) {
    super(detail ? `${kind}: ${detail}` : kind);
    this.name = "PlaylistError";
  }
}

export const FETCH_TIMEOUT_MS = 20_000;

/** True when the text looks like an M3U playlist and not an error page. */
export function looksLikeM3U(text: string): boolean {
  const head = text.replace(/^[\uFEFF\s]+/, "").slice(0, 4096);
  return head.startsWith("#EXTM3U") || head.includes("#EXTINF:");
}

export async function fetchPlaylist(url: string, fetchFn: typeof fetch = fetch, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, ctl ? { signal: ctl.signal } : undefined);
    if (!res.ok) throw new PlaylistError("http", String(res.status));
    const text = await res.text();
    if (!looksLikeM3U(text)) throw new PlaylistError("invalid");
    return text;
  } catch (e) {
    if (e instanceof PlaylistError) throw e;
    // A blocked cross-origin request and a dead server look the same to a page: both are "network".
    throw new PlaylistError(ctl?.signal.aborted ? "timeout" : "network", String(e));
  } finally {
    clearTimeout(timer);
  }
}

const CACHE = "skmate.cache.";
const MAX_CACHE_CHARS = 2_000_000;

/** The last good copy, so the TV opens the list at once and without the network. Big playlists are not cached. */
export function cacheGet(id: string): string | null {
  try { return localStorage.getItem(CACHE + id); } catch { return null; }
}

export function cachePut(id: string, text: string): void {
  try {
    if (text.length <= MAX_CACHE_CHARS) localStorage.setItem(CACHE + id, text);
  } catch { /* storage full: next time the playlist is fetched again */ }
}

export function cacheDrop(id: string): void {
  try { localStorage.removeItem(CACHE + id); } catch { /* nothing to drop */ }
}
