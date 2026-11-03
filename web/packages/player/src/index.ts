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
  /** Timeshift: open the live stream this many seconds behind its edge. Only hls.js can, so it alone is used. */
  liveBehindSeconds?: number;
  /** Take no picture taller than this many lines (hls.js can; a tile of the multiview that has no sound). */
  maxHeight?: number;
  /**
   * hls.js before the decoder of the page. A desktop browser reports native HLS as possible, then spends the first
   * segment (seconds, on a slow provider) finding out that it cannot play the stream, and hls.js starts over.
   * A TV's own decoder is the lightest and knows its codecs, so there native stays first.
   */
  hlsFirst?: boolean;
}

/** The engines in the order they are tried. By default the TV's own decoder first, then hls.js for `.m3u8`, then mpegts.js for raw `.ts`. */
export function defaultEngines(options: EngineOptions = {}): PlayerEngine[] {
  const native = new NativeEngine();
  const hls = new HlsJsEngine({ bufferSeconds: options.bufferSeconds, liveBehindSeconds: options.liveBehindSeconds, maxHeight: options.maxHeight });
  if (options.liveBehindSeconds) return [hls];
  // A capped picture is only possible on hls.js: it goes first, the TV's own decoder takes what hls.js cannot open.
  if (options.maxHeight && (options.preference ?? "auto") === "auto") return [hls, native, new MpegTsEngine()];
  const mpegts = new MpegTsEngine();
  switch (options.preference ?? "auto") {
    case "native": return [native];
    case "hls": return [hls];
    case "mpegts": return [mpegts];
    default: return options.hlsFirst ? [hls, native, mpegts] : [native, hls, mpegts];
  }
}
