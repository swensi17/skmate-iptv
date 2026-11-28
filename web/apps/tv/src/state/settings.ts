import { applyMotion, type MotionSetting } from "@skmate/ui";
import { applyLook, fontStack, setVar } from "./look";

export type ThemeSetting = "system" | "dark" | "light";
export type EngineSetting = "auto" | "native" | "hls" | "mpegts";
export type AspectSetting = "fit" | "fill" | "cover";
/** Seconds of video the web player keeps buffered: the live delay presets (10 / 30 / 60) or a custom 1–60. */
export type BufferSetting = number;
export type LanguageSetting = "auto" | import("../i18n/languages").LanguageCode;

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
  osdSeconds: 3 | 5 | 8 | 15 | 30;
  showEngine: boolean;
  autoRestart: boolean;
  /** A live window beside the channel list. */
  preview: boolean;
  /** The guide that comes by itself (playlist, provider, shared), as on Android. */
  epgAuto: boolean;
  /** Hours between downloads of the guide. */
  /** When the guide is downloaded again (2.6.9, Android EpgAutoRefresh): 0 never by itself, -1 at each start, else hours. */
  epgEvery: number;
  /** When the playlist is read again from its link (Android PlaylistAutoRefresh): 0 never, -1 at each start, else hours. */
  plEvery: number;
  /** Guides the user added. */
  epgSources: Array<{ id: string; name: string; url: string }>;
  /** A proxy for guides the TV cannot reach directly; empty = none. */
  proxy: string;
  /** Height of a row in the channel lists, px. */
  rowSize: 72 | 84 | 96;
  /** Percent of the full-size interface (Android UI zoom: 50–150, step 5, default 100). */
  uiScale: number;
  showLogos: boolean;
  showNumbers: boolean;
  showProgram: boolean;
  /** Categories the viewer likes (from the first-run questions): they go to the top of the list. */
  interests: string[];
  /** Install a new version by itself when nothing is playing; off = ask at every start. */
  autoUpdate: boolean;
  /** When a reminded programme comes: ask to switch, switch, or only say so (as on Android). */
  reminderMode: "ask" | "switch" | "notify";
  /** Minutes before the start a reminder comes: 0, 1 or 5. */
  reminderLead: 0 | 1 | 5;
  /** The Windows app: channels open in VLC or mpv on this computer instead (Android's external player). */
  externalPlayer: "off" | "vlc" | "mpv";
  /** Several live channels on one screen (off by default, as on Android), and the most tiles it may use (1–4). */
  multiview: boolean;
  multiviewTiles: number;
  /** The warning about more than two tiles was accepted once. */
  multiviewWarned: boolean;

  // ---- settings (Android): the rows of the Android settings sheet. Fields marked "stored" keep the choice (and go
  // into a backup) but nothing in the web app acts on them yet.
  /** Rows pinned to "Быстрые настройки", in pin order (Android quickPinnedKeys). */
  quickPinned: string[];
  /** Sound in the live preview (stored). */
  previewAudio: boolean;
  /** Type a channel number on the remote to switch (stored). */
  directTune: boolean;
  /** Prefer SDR when a stream has both (stored: no web API). */
  preferSdr: boolean;
  /** The next episode starts by itself (stored). */
  autoPlayNext: boolean;
  /** Look for a new version 5 s after the app opens; then every 6 h / a day; install any time or 02:00–06:00 (useUpdates). */
  updateOnStart: boolean;
  updateEvery: "start" | "6h" | "day";
  updateWindow: "any" | "night";
  /** Guide time shift, minutes, −720…+840 in steps of 30 (applied in useGuide: every programme moves, archives too). */
  epgOffsetMin: number;
  /** Days of programme kept ahead, 1–14 (applied in useGuide: what a download stores in IndexedDB and the grid reaches). */
  guideDays: number;
  /** Archive time zone (applied in useGuide → core setArchiveZone): automatic = the device's, the device's, or a UTC offset. */
  catchupTz: "auto" | "device" | "manual";
  catchupOffsetMin: number;
  /** Per playlist id: "device" or an offset in minutes; absent = as in Settings (applied, it wins over the global one). */
  catchupPerPlaylist: Record<string, "device" | number>;
  /** Accent preset (applied), or a custom hex. */
  accent: "ink" | "teal" | "blue" | "violet" | "green" | "amber";
  accentHex: string;
  /** Focus highlight: colour ("" = the accent; drawn on the ring styles) and width 0 thin … 3 very thick (Android reads the width nowhere). */
  focusColor: string;
  focusWidth: 0 | 1 | 2 | 3;
  /** Glass and background (stored: the TV-box look draws flat panels, on Android too). */
  bgMode: number;
  bgLook: number;
  bgDim: number;
  bgBlur: number;
  bgGlow: boolean;
  glassOn: boolean;
  glassOpacity: number;
  /** Fonts: family, text size 60–140 and popup text size 50–120 (applied by look.ts). */
  fontFamily: string;
  fontSize: number;
  popupFontSize: number;
  /** Popup size, percent 50–120 (the whole popup card scales, look.ts). */
  popupSize: number;
  motionSpeed: "fast" | "normal" | "slow";
  /** Date, time and weather on the home screen (HomeStatus). */
  weatherOn: boolean;
  weatherPlace: string;
  tempUnit: "c" | "f";
  /** Navigation (stored: the TV-box rail does not use it, on Android too); Live TV layout (stored) and how it opens (App). */
  navStyle: "floating" | "docked";
  navSize: number;
  navLength: number;
  liveLayout: "stage" | "separate";
  liveOpensIn: "list" | "guide";
  /** Remote buttons (stored). */
  chNav: boolean;
  liveKeys: Record<string, string>;
  /** Remember the last category / item, for live, films, series (live applied in LiveView; films and series have no TV-box screen). */
  browseLastCat: boolean[];
  browseLastItem: boolean[];
  /** External player per section; live drives externalPlayer where the Windows app found one. */
  extLive: boolean;
  extMovies: boolean;
  extSeries: boolean;
  /** The recently watched row under the live info (2.6.8); off: the controls at once. */
  playerRecents: boolean;
  /** The player's channel panel in three columns, the programme beside the list (2.7.1); off: by ▶ only. */
  playerColumns: boolean;
  /** Clock over the video and its look (stored). */
  playerClock: boolean;
  clockSize: number;
  clockWeight: number;
  clockBg: number;
  clockColor: number;
  clockAlpha: number;
  /** Default zoom: fit, crop and stretch drive aspect; the other three are stored. */
  zoomMode: "fit" | "crop" | "stretch" | "original" | "16_9" | "4_3" | "2_39";
  /** Frame rate (stored: no web API). */
  afr: boolean;
  afrPause: number;
  afrResolution: boolean;
  /** Live buffer and delay; drives buffer. */
  liveLatency: "low" | "balanced" | "stable" | "custom";
  liveCustomSec: number;
  /** Per playlist id: the live delay of that playlist (App liveSettingsFor). */
  latencyPerPlaylist: Record<string, string>;
  /** Stop retrying after, seconds (0 = never) (stored). */
  tuneTimeout: number;
  tuneTimeoutPerPlaylist: Record<string, number>;
  /** Films and archive buffer, seconds (0 = auto) (stored). */
  vodBuffer: number;
  /** Mini player (stored). */
  miniSize: number;
  miniPos: string;
  /** What opens at start (applied in App: the channels, the last channel, Favourites, or the channel picked here). */
  startup: "home" | "last" | "favorites" | "channel";
  /** "Выбранный канал": its channelKey and the name shown in the row. */
  startupChannel: string;
  startupChannelName: string;
  /** Home clock colours (Дата, время и погода): "" = as designed (time Text, date/weather Muted), "accent", or a hex. */
  clockTimeColor: string;
  clockDateColor: string;
  clockWeatherColor: string;
  /** Use the guide proxy above. */
  proxyOn: boolean;
  /** DNS (stored: a web app uses the TV's resolver). */
  dnsOn: boolean;
  dnsServer: string;
  /** Detailed playback log (stored). */
  playbackLog: boolean;
  /** screens 2.5.4 (Android SettingsRepository adultLockEnabled): 18+ groups closed behind the profile's PIN on every profile. */
  adultLock: boolean;
  /** screens 2.5.4 (Android programmePosters): a film's TMDB poster in the channel logo's place (Эфир и буфер › Постеры фильмов). */
  programmePosters: boolean;
  /**
   * player 2.5.4 (Android MetadataConfig, Settings › categories › metadata): TMDB on, the viewer's own key ("" = SkMate's,
   * put in at build time from VITE_SKMATE_TMDB_KEY), and the language TMDB answers in ("" = the app's).
   */
  metadataOn: boolean;
  tmdbKey: string;
  tmdbLanguage: string;
}

const KEY = "skmate.settings.v1";
export const DEFAULTS: Settings = {
  theme: "system", motion: "auto", language: "auto", engine: "auto", aspect: "fit", buffer: 30,
  openTimeout: 12, osdSeconds: 5, showEngine: true, autoRestart: true, preview: true,
  epgAuto: true, epgEvery: 12, plEvery: -1, epgSources: [], proxy: "",
  rowSize: 84, uiScale: 100, showLogos: true, showNumbers: true, showProgram: true, interests: [], autoUpdate: false,
  reminderMode: "ask", reminderLead: 5, externalPlayer: "off", multiview: false, multiviewTiles: 2, multiviewWarned: false,
  quickPinned: ["quick_live_preview", "quick_preview_sound", "quick_channel_numbers", "quick_hdr", "quick_autoplay", "quick_check_update"],
  previewAudio: false, directTune: true, preferSdr: false, autoPlayNext: true, updateOnStart: true, updateEvery: "6h", updateWindow: "any",
  epgOffsetMin: 0, guideDays: 7, catchupTz: "auto", catchupOffsetMin: 0, catchupPerPlaylist: {},
  accent: "ink", accentHex: "", focusColor: "", focusWidth: 1,
  bgMode: 0, bgLook: 0, bgDim: 40, bgBlur: 40, bgGlow: true, glassOn: true, glassOpacity: 50,
  fontFamily: "PLUS_JAKARTA_SANS", fontSize: 100, popupFontSize: 100, popupSize: 100, motionSpeed: "normal",
  weatherOn: true, weatherPlace: "", tempUnit: "c", navStyle: "docked", navSize: 0, navLength: 0, liveLayout: "stage", liveOpensIn: "list",
  // Android SettingsRepository: remember_cat_live / remember_last_live on, films and series off.
  chNav: true, liveKeys: {}, browseLastCat: [true, false, false], browseLastItem: [true, false, false],
  extLive: false, extMovies: false, extSeries: false,
  playerRecents: true, playerColumns: true, playerClock: false, clockSize: 1, clockWeight: 1, clockBg: 1, clockColor: 0, clockAlpha: 1,
  zoomMode: "fit", afr: false, afrPause: 0, afrResolution: false,
  liveLatency: "balanced", liveCustomSec: 8, latencyPerPlaylist: {}, tuneTimeout: 30, tuneTimeoutPerPlaylist: {}, vodBuffer: 0,
  miniSize: 25, miniPos: "br", startup: "home", startupChannel: "", startupChannelName: "",
  clockTimeColor: "", clockDateColor: "", clockWeatherColor: "", proxyOn: true, dnsOn: false, dnsServer: "", playbackLog: false,
  adultLock: true, programmePosters: true,
  metadataOn: true, tmdbKey: "", tmdbLanguage: "",
};

/** Android UI zoom: 50–150 % in steps of 5 (C/theme/UiZoom.kt). */
export function clampZoom(n: number): number {
  return Math.max(50, Math.min(150, Math.round(n / 5) * 5));
}

/** The live delay presets as seconds the web player buffers (Android LiveLatency: low, balanced, stable, custom). */
export function bufferFor(latency: Settings["liveLatency"], customSec: number): number {
  return latency === "low" ? 10 : latency === "stable" ? 60 : latency === "custom" ? Math.max(1, Math.min(60, customSec)) : 30;
}

/** The accent presets' primary colour per theme (PAL:95-124); INK is the theme's own and is not overridden. */
export const ACCENTS: Record<Settings["accent"], { dark: string; light: string }> = {
  ink: { dark: "#F2F0ED", light: "#121212" },
  teal: { dark: "#52DBC8", light: "#006B5E" },
  blue: { dark: "#6FB0FF", light: "#1565C0" },
  violet: { dark: "#CBBEFF", light: "#5B45C9" },
  green: { dark: "#6FDB94", light: "#1B6B3F" },
  amber: { dark: "#FFB95C", light: "#8A5100" },
};

/** The accent drawn now: a custom hex, a preset for the theme, or null for INK (the theme's own). */
export function accentColor(s: Pick<Settings, "accent" | "accentHex">, dark: boolean): string | null {
  if (/^#[0-9a-fA-F]{6}$/.test(s.accentHex)) return s.accentHex.toUpperCase();
  if (s.accent === "ink") return null;
  return ACCENTS[s.accent][dark ? "dark" : "light"];
}

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

/**
 * Whether the system asks for the dark look. A TV that does not know the question (webOS 4–6 = Chromium 53–79 before
 * 76, older Tizen) answers neither: then the dark look, the TV's own, never the light one by accident (it painted the
 * category names nearly black on a real LG).
 */
export function systemDark(mm?: (q: string) => { matches: boolean; media: string }): boolean {
  if (!mm) return true;
  const dark = mm("(prefers-color-scheme: dark)");
  const light = mm("(prefers-color-scheme: light)");
  if (dark.media === "not all" || (!dark.matches && !light.matches)) return true;
  return dark.matches;
}

export function applyTheme(theme: ThemeSetting, root: HTMLElement = document.documentElement): void {
  const dark = systemDark(typeof matchMedia === "function" ? matchMedia : undefined);
  const next = resolveTheme(theme, dark);
  if (root.getAttribute("data-theme") !== next) root.setAttribute("data-theme", next);
}

export function applyAll(s: Settings, throttled: boolean): void {
  // Each root property is written only when it changes (setVar): a write restyles the whole page, and this runs on
  // every settings change (a toggle in the sheet must not restyle the screen behind it).
  const root = document.documentElement;
  setVar(root, "--row-h", `${s.rowSize}px`);
  setVar(root, "--ui-zoom", String(clampZoom(s.uiScale) / 100));
  applyTheme(s.theme);
  // The accent (Внешний вид › Акцентный цвет): the theme's own INK unless a preset or a hex is chosen.
  const accent = accentColor(s, root.getAttribute("data-theme") !== "light");
  setVar(root, "--st-accent", accent);
  // Marks follow the accent (2.7.1, as Android): a coloured one replaces the brand blue; ink, black or white keep it.
  const hue = markHue(accent);
  setVar(root, "--st-blue", hue);
  setVar(root, "--st-blue-rgb", hue ? rgbOf(hue) : null);
  if (hue) root.setAttribute("data-hue", ""); else root.removeAttribute("data-hue");
  applyMotion(s.motion, throttled);
  // settings functions (Android): fonts, popup size, animation speed, focus highlight colour (state/look.ts).
  applyLook(s);
  setVar(root, "--st-font", fontStack(s.fontFamily));
  // The focus colour reaches only the ring styles on TV-box (the poster ring of the profile); "" = the accent.
  setVar(root, "--st-focus-ring", /^#[0-9a-fA-F]{6}$/.test(s.focusColor) ? s.focusColor : null);
  // The focus plates take the chosen colour too (#webos: "the highlight stays white whatever colour is picked").
  setVar(root, "--st-focus-plate", /^#[0-9a-fA-F]{6}$/.test(s.focusColor) ? s.focusColor : null);
}

/**
 * The settings a channel of [playlistId] plays with: its own live delay (Эфир и буфер › per playlist) when it has
 * one, else the general one (Android: the source's livePreroll override).
 */
export function liveSettingsFor(s: Settings, playlistId: string | null | undefined): Settings {
  const own = playlistId ? s.latencyPerPlaylist[playlistId] : undefined;
  if (!own) return s;
  const latency = own as Settings["liveLatency"];
  const buffer = bufferFor(latency, s.liveCustomSec);
  return buffer === s.buffer && latency === s.liveLatency ? s : { ...s, liveLatency: latency, buffer };
}

/** The marks' colour for an accent: itself when it has colour, null (the brand blue) for grey, black or white. */
export function markHue(accent: string | null): string | null {
  if (!accent || !/^#[0-9a-fA-F]{6}$/.test(accent)) return null;
  const [r, g, b] = rgbOf(accent).split(", ").map(Number) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max - min < 40 ? null : accent;
}

function rgbOf(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
