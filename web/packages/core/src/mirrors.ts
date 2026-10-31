import type { Channel } from "./m3u/parse";
import { normalize } from "./search/text";

/**
 * The same channel offered twice: "Первый HD" and "Первый канал SD". When one copy will not play, the next is the
 * best bet, so the player hops to it instead of stopping. Ported from the Android app's ChannelMirrors.
 * Two channels are copies when their names agree once quality marks and filler words are dropped; time zones
 * ("+2") and regions are different names and stay different.
 */
export const MAX_HOPS = 3;

const QUALITY: Record<string, number> = {
  "4k": 4, uhd: 4, "8k": 4, fhd: 3, hd: 2, hevc: 2, h265: 2, h264: 2, sd: 0, lq: 0, hq: 2, "50fps": 2, "60fps": 2,
};
const NOISE = new Set([
  "backup", "reserve", "reserv", "резерв", "резервный", "mirror", "vip", "new", "tv", "тв", "канал", "channel", "ch", "live",
]);

const tokens = (name: string): string[] => normalize(name.replace(/[[\](){}]/g, " ")).split(" ").filter((t) => t !== "");

/** The name with quality marks and filler words dropped: the key two copies share. */
export function mirrorKey(name: string): string {
  return tokens(name).filter((t) => !(t in QUALITY) && !NOISE.has(t)).join(" ");
}

/** 4 for 4K, 3 FHD, 2 HD, 1 unmarked, 0 SD: which copy looks best. */
export function quality(name: string): number {
  const found = tokens(name).map((t) => QUALITY[t]).filter((q): q is number => q !== undefined);
  return found.length > 0 ? Math.max(...found) : 1;
}

/**
 * The copies of [channel] among [all], best first: not tried yet, a different stream, the same key; the closest to
 * the quality it had first (a SD copy beats nothing, but HD comes first), then the better one.
 */
export function pickMirrors(channel: Channel, all: readonly Channel[], tried: ReadonlySet<string> = new Set()): Channel[] {
  const key = mirrorKey(channel.name);
  if (key === "") return [];
  const q = quality(channel.name);
  return all
    .filter((c) => c.id !== channel.id && !tried.has(c.id) && c.url !== channel.url && mirrorKey(c.name) === key)
    .sort((a, b) => Math.abs(quality(a.name) - q) - Math.abs(quality(b.name) - q) || quality(b.name) - quality(a.name) || Number(a.id) - Number(b.id))
    .slice(0, MAX_HOPS);
}
