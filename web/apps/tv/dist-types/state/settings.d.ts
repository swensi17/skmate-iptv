import { type MotionSetting } from "@skmate/ui";
export type ThemeSetting = "system" | "dark" | "light";
export interface Settings {
    theme: ThemeSetting;
    motion: MotionSetting;
}
export declare const DEFAULTS: Settings;
export declare function load(): Settings;
export declare function save(s: Settings): void;
/** The theme that is actually drawn: "system" follows the TV. */
export declare function resolveTheme(theme: ThemeSetting, systemDark: boolean): "dark" | "light";
export declare function applyTheme(theme: ThemeSetting, root?: HTMLElement): void;
export declare function applyAll(s: Settings, throttled: boolean): void;
