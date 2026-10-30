export interface PlaylistEntry {
    id: string;
    name: string;
    url: string;
}
/** A readable name from a link: the host, or the last path segment when it says more. */
export declare function nameFromUrl(url: string): string;
/** Accepts only http(s) links; everything else is not a playlist the TV can fetch. */
export declare function normalizeUrl(input: string): string | null;
/** Adds a playlist; the same link twice is one playlist. */
export declare function addPlaylist(list: readonly PlaylistEntry[], url: string, name?: string): PlaylistEntry[];
export declare function removePlaylist(list: readonly PlaylistEntry[], id: string): PlaylistEntry[];
/** After a removal the active playlist stays, or falls to the first one that is left. */
export declare function nextActive(list: readonly PlaylistEntry[], activeId: string | null): string | null;
export interface PlaylistStore {
    list: PlaylistEntry[];
    activeId: string | null;
}
export declare function loadStore(): PlaylistStore;
export declare function saveStore(s: PlaylistStore): void;
