export class PlaylistError extends Error {
    constructor(kind, detail) {
        super(detail ? `${kind}: ${detail}` : kind);
        this.kind = kind;
        this.name = "PlaylistError";
    }
}
export const FETCH_TIMEOUT_MS = 20000;
/** True when the text looks like an M3U playlist and not an error page. */
export function looksLikeM3U(text) {
    const head = text.replace(/^[\uFEFF\s]+/, "").slice(0, 4096);
    return head.startsWith("#EXTM3U") || head.includes("#EXTINF:");
}
export async function fetchPlaylist(url, fetchFn = fetch, timeoutMs = FETCH_TIMEOUT_MS) {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => ctl === null || ctl === void 0 ? void 0 : ctl.abort(), timeoutMs);
    try {
        const res = await fetchFn(url, ctl ? { signal: ctl.signal } : undefined);
        if (!res.ok)
            throw new PlaylistError("http", String(res.status));
        const text = await res.text();
        if (!looksLikeM3U(text))
            throw new PlaylistError("invalid");
        return text;
    }
    catch (e) {
        if (e instanceof PlaylistError)
            throw e;
        // A blocked cross-origin request and a dead server look the same to a page: both are "network".
        throw new PlaylistError((ctl === null || ctl === void 0 ? void 0 : ctl.signal.aborted) ? "timeout" : "network", String(e));
    }
    finally {
        clearTimeout(timer);
    }
}
const CACHE = "skmate.cache.";
const MAX_CACHE_CHARS = 2000000;
/** The last good copy, so the TV opens the list at once and without the network. Big playlists are not cached. */
export function cacheGet(id) {
    try {
        return localStorage.getItem(CACHE + id);
    }
    catch (_a) {
        return null;
    }
}
export function cachePut(id, text) {
    try {
        if (text.length <= MAX_CACHE_CHARS)
            localStorage.setItem(CACHE + id, text);
    }
    catch ( /* storage full: next time the playlist is fetched again */_a) { /* storage full: next time the playlist is fetched again */ }
}
export function cacheDrop(id) {
    try {
        localStorage.removeItem(CACHE + id);
    }
    catch ( /* nothing to drop */_a) { /* nothing to drop */ }
}
