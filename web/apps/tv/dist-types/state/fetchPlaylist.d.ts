export type FetchFailure = "network" | "http" | "invalid" | "timeout";
export declare class PlaylistError extends Error {
    readonly kind: FetchFailure;
    constructor(kind: FetchFailure, detail?: string);
}
export declare const FETCH_TIMEOUT_MS = 20000;
/** True when the text looks like an M3U playlist and not an error page. */
export declare function looksLikeM3U(text: string): boolean;
export declare function fetchPlaylist(url: string, fetchFn?: typeof fetch, timeoutMs?: number): Promise<string>;
/** The last good copy, so the TV opens the list at once and without the network. Big playlists are not cached. */
export declare function cacheGet(id: string): string | null;
export declare function cachePut(id: string, text: string): void;
export declare function cacheDrop(id: string): void;
