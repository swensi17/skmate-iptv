import { type Channel } from "@skmate/core";
import { type PlaylistStore } from "./playlists";
export type Status = {
    kind: "idle";
} | {
    kind: "loading";
} | {
    kind: "error";
    message: string;
};
/** The playlists, the one in use and its channels: everything the screens need, nothing about how they look. */
export declare function usePlaylists(): {
    store: PlaylistStore;
    active: import("./playlists").PlaylistEntry | null;
    channels: Channel[];
    status: Status;
    add: (input: string) => string | null;
    addDemo: () => void;
    select: (id: string) => void;
    remove: (id: string) => void;
};
