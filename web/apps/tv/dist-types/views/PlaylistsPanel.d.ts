import type { PlaylistStore } from "../state/playlists";
import type { Status } from "../state/usePlaylists";
interface Props {
    store: PlaylistStore;
    status: Status;
    onAdd: (input: string) => string | null;
    onSelect: (id: string) => void;
    onAskDelete: (id: string) => void;
}
export declare function PlaylistsPanel(p: Props): import("preact").JSX.Element;
export {};
