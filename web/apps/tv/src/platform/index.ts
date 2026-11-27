export type PlatformId = "webos" | "tizen" | "browser";

/** Which TV the page runs on; decides the key registration and the packaging, nothing else. */
export function detectPlatform(ua: string = navigator.userAgent): PlatformId {
  if (/web0s|webos/i.test(ua)) return "webos";
  if (/tizen/i.test(ua)) return "tizen";
  return "browser";
}

interface TizenApi { tvinputdevice?: { registerKey(name: string): void } }

/**
 * The keys Tizen delivers only once they are registered: everything the Android player answers to (its PlayerHud and
 * the shell around it): the media keys, CH+/−, the digits for direct tune, Info, the channel list and "previous
 * channel" keys, the four colour keys. An older Tizen without one of them skips it.
 */
const TIZEN_KEYS = [
  "MediaPlayPause", "MediaPlay", "MediaPause", "MediaStop", "MediaRewind", "MediaFastForward", "MediaTrackPrevious", "MediaTrackNext",
  "ChannelUp", "ChannelDown", "PreviousChannel", "ChannelList", "Info", "Menu",
  "ColorF0Red", "ColorF1Green", "ColorF2Yellow", "ColorF3Blue",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
];

/** Tizen delivers some remote keys only after they are registered. */
export function registerRemoteKeys(platform: PlatformId): void {
  if (platform !== "tizen") return;
  const tizen = (window as unknown as { tizen?: TizenApi }).tizen;
  for (const key of TIZEN_KEYS) {
    try { tizen?.tvinputdevice?.registerKey(key); } catch { /* an older Tizen has fewer keys */ }
  }
}

/**
 * A remote key by what it means, as the Android player names them (Key.ChannelUp, Key.MediaPlayPause …). TV remotes
 * often send only a keyCode, so the codes decide; a computer keyboard's names are taken too.
 * Tizen: 427/428 CH±, 10252 Play/Pause, 415 Play, 19 Pause, 413 Stop, 412 RW, 417 FF, 10232/10233 track prev/next,
 * 10190 previous channel, 10073 channel list, 457 Info, 403–406 colours, 48–57 digits. webOS: CH± arrive as 33/34
 * (PageUp/PageDown), the media and colour keys with the same codes as Tizen.
 */
export type RemoteKey =
  | "up" | "down" | "left" | "right" | "ok"
  | "chUp" | "chDown" | "playPause" | "play" | "pause" | "stop" | "rewind" | "forward" | "next" | "prev"
  | "lastChannel" | "channelList" | "info" | "menu" | "red" | "green" | "yellow" | "blue"
  | { digit: number };

const CODES: Record<number, RemoteKey> = {
  38: "up", 40: "down", 37: "left", 39: "right", 13: "ok",
  427: "chUp", 428: "chDown", 33: "chUp", 34: "chDown",
  10252: "playPause", 415: "play", 19: "pause", 413: "stop", 412: "rewind", 417: "forward",
  10232: "prev", 10233: "next", 10190: "lastChannel", 10073: "channelList", 457: "info", 82: "menu", 93: "menu",
  403: "red", 404: "green", 405: "yellow", 406: "blue",
};
const NAMES: Record<string, RemoteKey> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "ok",
  MediaPlayPause: "playPause", MediaPlay: "play", MediaPause: "pause", MediaStop: "stop",
  MediaRewind: "rewind", MediaFastForward: "forward", MediaTrackNext: "next", MediaTrackPrevious: "prev",
  ChannelUp: "chUp", ChannelDown: "chDown", PageUp: "chUp", PageDown: "chDown", ContextMenu: "menu", Menu: "menu",
};

export function remoteKey(e: KeyboardEvent): RemoteKey | null {
  const byName = e.key ? NAMES[e.key] : undefined;
  if (byName) return byName;
  if (e.key && e.key.length === 1 && e.key >= "0" && e.key <= "9") return { digit: Number(e.key) };
  const code = e.keyCode;
  if (code >= 48 && code <= 57 && !e.shiftKey) return { digit: code - 48 };
  if (code >= 96 && code <= 105) return { digit: code - 96 }; // the number pad of a keyboard
  return CODES[code] ?? null;
}

interface WebOsApi { platformBack?(): void }
interface PalmSystemApi { platformBack?(): void }

/**
 * Leaves the app the TV's way, as the stores require for Back on the entry screen (LG App Self Checklist, Samsung QA):
 * Tizen closes the application; webOS (appinfo `disableBackHistoryAPI: true`, so the app owns Back) calls
 * `webOS.platformBack()` — webOSTV.js, or the system's own `PalmSystem` when that library is not loaded — which on
 * webOS 6+ shows the system's exit question and on older webOS returns to the launcher; `window.close()` as the last
 * resort. In a desktop browser there is nothing to leave to: false, and the page stays.
 */
export function exitApp(platform: PlatformId = detectPlatform()): boolean {
  const w = window as unknown as { tizen?: { application?: { getCurrentApplication(): { exit(): void } } }; webOS?: WebOsApi; PalmSystem?: PalmSystemApi };
  try {
    if (platform === "tizen") { w.tizen?.application?.getCurrentApplication().exit(); return true; }
    if (platform === "webos") {
      if (w.webOS?.platformBack) { w.webOS.platformBack(); return true; }
      if (w.PalmSystem?.platformBack) { w.PalmSystem.platformBack(); return true; }
      window.close();
      return true;
    }
  } catch { /* fall through: try closing the window */ }
  if (platform === "browser") return false;
  try { window.close(); } catch { /* nothing else to try */ }
  return true;
}
