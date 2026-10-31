import { applyMotion, type MotionSetting } from "@skmate/ui";

export type ThemeSetting = "system" | "dark" | "light";
export type EngineSetting = "auto" | "native" | "hls";
export type AspectSetting = "fit" | "fill" | "cover";
export type BufferSetting = 10 | 30 | 60;
export type LanguageSetting = "auto" | "ru" | "en";

export interface Settings {
  theme: ThemeSetting;
  motion: MotionSetting;
  language: LanguageSetting;
  engine: EngineSetting;
  aspect: AspectSetting;
  /** Seconds of video hls.js keeps buffered. */
  buffer: BufferSetting;
  /** Seconds an engine may take to show the first frame. */
  openTimeout: 8 | 12 | 20;
  /** Seconds before the player panel hides. */
  osdSeconds: 3 | 5 | 8;
  showEngine: boolean;
  autoRestart: boolean;
  /** A live window beside the channel list. */
  preview: boolean;
}

const KEY = "skmate.settings.v1";
export const DEFAULTS: Settings = {
  theme: "system", motion: "auto", language: "auto", engine: "auto", aspect: "fit", buffer: 30,
  openTimeout: 12, osdSeconds: 5, showEngine: true, autoRestart: true, preview: true,
};

export function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS; // storage can be unavailable or hold something else: start from the defaults
  }
}

export function save(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* the setting just does not persist */ }
}

/** The theme that is actually drawn: "system" follows the TV. */
export function resolveTheme(theme: ThemeSetting, systemDark: boolean): "dark" | "light" {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export function applyTheme(theme: ThemeSetting, root: HTMLElement = document.documentElement): void {
  const dark = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)").matches : true;
  root.setAttribute("data-theme", resolveTheme(theme, dark));
}

export function applyAll(s: Settings, throttled: boolean): void {
  applyTheme(s.theme);
  applyMotion(s.motion, throttled);
}
