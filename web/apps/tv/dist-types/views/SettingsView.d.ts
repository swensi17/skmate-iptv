import type { PlaylistStore } from "../state/playlists";
import type { Settings } from "../state/settings";
import type { Status } from "../state/usePlaylists";
interface Props {
    settings: Settings;
    onChange: (s: Settings) => void;
    store: PlaylistStore;
    status: Status;
    onAddPlaylist: (input: string) => string | null;
    onSelectPlaylist: (id: string) => void;
    onAskDeletePlaylist: (id: string) => void;
}
export declare function SettingsView({ settings, onChange, store, status, onAddPlaylist, onSelectPlaylist, onAskDeletePlaylist }: Props): import("preact").JSX.Element;
export {};
