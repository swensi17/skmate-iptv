import { type Channel } from "@skmate/core";
import type { Status } from "../state/usePlaylists";
interface Props {
    channels: Channel[];
    favorites: ReadonlySet<string>;
    status: Status;
    onOpen: (c: Channel) => void;
    onFav: (c: Channel) => void;
    onAddPlaylist: () => void;
    onDemo: () => void;
}
export declare function LiveView(p: Props): import("preact").JSX.Element;
export {};
