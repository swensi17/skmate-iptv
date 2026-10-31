export * from "./engine";
export * from "./ladder";
export { NativeEngine } from "./engines/native";
export { HlsJsEngine, type HlsOptions } from "./engines/hls";

import { HlsJsEngine } from "./engines/hls";
import { NativeEngine } from "./engines/native";
import type { PlayerEngine } from "./engine";

/** Which decoder opens a channel: the TV's own, hls.js, or the TV's first and hls.js when it fails. */
export type EnginePreference = "auto" | "native" | "hls";

export interface EngineOptions {
  preference?: EnginePreference;
  /** Seconds of video hls.js keeps ahead of the picture. */
  bufferSeconds?: number;
}

/** The engines in the order they are tried. By default the TV's own decoder first, hls.js as the fallback. */
export function defaultEngines(options: EngineOptions = {}): PlayerEngine[] {
  const native = new NativeEngine();
  const hls = new HlsJsEngine({ bufferSeconds: options.bufferSeconds });
  switch (options.preference ?? "auto") {
    case "native": return [native];
    case "hls": return [hls];
    default: return [native, hls];
  }
}
