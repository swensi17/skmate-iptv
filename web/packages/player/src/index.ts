export * from "./engine";
export * from "./ladder";
export { NativeEngine } from "./engines/native";
export { HlsJsEngine, type HlsOptions } from "./engines/hls";
export { MpegTsEngine } from "./engines/mpegts";

import { HlsJsEngine } from "./engines/hls";
import { MpegTsEngine } from "./engines/mpegts";
import { NativeEngine } from "./engines/native";
import type { PlayerEngine } from "./engine";

/** Which decoder opens a channel: the TV's own, hls.js, mpegts.js, or in turn (auto). */
export type EnginePreference = "auto" | "native" | "hls" | "mpegts";

export interface EngineOptions {
  preference?: EnginePreference;
  /** Seconds of video hls.js keeps ahead of the picture. */
  bufferSeconds?: number;
}

/** The engines in the order they are tried. By default the TV's own decoder first, then hls.js for `.m3u8`, then mpegts.js for raw `.ts`. */
export function defaultEngines(options: EngineOptions = {}): PlayerEngine[] {
  const native = new NativeEngine();
  const hls = new HlsJsEngine({ bufferSeconds: options.bufferSeconds });
  const mpegts = new MpegTsEngine();
  switch (options.preference ?? "auto") {
    case "native": return [native];
    case "hls": return [hls];
    case "mpegts": return [mpegts];
    default: return [native, hls, mpegts];
  }
}
