import type { Channel } from "@skmate/core";
/** The same channel across reloads: its tvg-id, or name and link together (one stream can sit under two names). */
export declare const channelKey: (c: Channel) => string;
export declare function toggle(favs: ReadonlySet<string>, key: string): Set<string>;
export declare function loadFavorites(): Set<string>;
export declare function saveFavorites(favs: ReadonlySet<string>): void;
