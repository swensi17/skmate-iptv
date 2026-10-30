import type { Settings } from "../state/settings";
export declare function SettingsView({ settings, onChange }: {
    settings: Settings;
    onChange: (s: Settings) => void;
}): import("preact").JSX.Element;
