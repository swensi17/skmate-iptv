export * from "./engine";
export * from "./ladder";
export { NativeEngine } from "./engines/native";
export { HlsJsEngine } from "./engines/hls";

import { HlsJsEngine } from "./engines/hls";
import { NativeEngine } from "./engines/native";
import type { PlayerEngine } from "./engine";

/** The order every platform starts with: the TV's own decoder first, hls.js as the fallback. */
export function defaultEngines(): PlayerEngine[] {
  return [new NativeEngine(), new HlsJsEngine()];
}
