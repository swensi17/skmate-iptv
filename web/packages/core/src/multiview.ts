// Several live channels on one screen, after the Android app's MultiviewState and ConnectionBudget: a grid of one to
// four tiles, one of them with the sound, each channel one of the provider's connections. Pure, so the screen only
// shows what these functions decide.
import type { Channel } from "./m3u/parse";

export const MIN_MULTIVIEW_TILES = 1;
export const MAX_MULTIVIEW_TILES = 4;
export const DEFAULT_MULTIVIEW_TILES = 2;
/** A tile that has no sound takes no picture taller than this (Android's BACKGROUND_TILE_HEIGHT). */
export const BACKGROUND_TILE_HEIGHT = 720;
/** OK held this long opens a tile's menu instead of acting on it. */
export const LONG_PRESS_MS = 500;

export const clampTiles = (n: number): number => Math.min(MAX_MULTIVIEW_TILES, Math.max(MIN_MULTIVIEW_TILES, Math.round(n) || DEFAULT_MULTIVIEW_TILES));

/** How many tiles the grid opens with: two, or fewer when that is all the setting allows. */
export const openingTileCount = (max: number): number => Math.max(1, Math.min(2, max));

/** The tiles in rows of two: 1 → [[0]], 2 → [[0,1]], 3 → [[0,1],[2]] (the lone tile keeps its size), 4 → 2×2. */
export function rowsOf(count: number): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < count; i += 2) rows.push(i + 1 < count ? [i, i + 1] : [i]);
  return rows;
}

export interface Grid {
  /** A channel per tile, null for an empty one. A tile keeps its place for as long as the grid is open. */
  tiles: ReadonlyArray<Channel | null>;
  focused: number;
  /** The one tile with the sound. */
  audible: number;
}

const firstFilled = (tiles: ReadonlyArray<Channel | null>, skip: ReadonlySet<number> = new Set()): number =>
  tiles.findIndex((c, i) => c !== null && !skip.has(i));

/** The grid that opens for [channel] on screen: it is tile 0 and has the sound, the rest wait empty. */
export function openGrid(channel: Channel, max: number): Grid {
  const tiles: Array<Channel | null> = [channel];
  while (tiles.length < openingTileCount(max)) tiles.push(null);
  return { tiles, focused: 0, audible: 0 };
}

/**
 * Channels kept for the multiview (the playing one first) in a grid: it grows up to [max] tiles, the playing channel
 * is not twice in it, and the first tile has the sound.
 */
export function gridFrom(playing: Channel, kept: readonly Channel[], max: number): Grid {
  const rest = kept.filter((c) => c.id !== playing.id).slice(0, max - 1);
  const tiles: Array<Channel | null> = [playing, ...rest];
  while (tiles.length < openingTileCount(max)) tiles.push(null);
  return { tiles, focused: 0, audible: 0 };
}

export const canAddTile = (g: Grid, max: number): boolean => g.tiles.length < max;

export function addTile(g: Grid, max: number): Grid {
  return canAddTile(g, max) ? { ...g, tiles: [...g.tiles, null], focused: g.tiles.length } : g;
}

export const focus = (g: Grid, tile: number): Grid => (tile >= 0 && tile < g.tiles.length ? { ...g, focused: tile } : g);

/** [channel] on [tile]. The first channel to fill a grid with no sound takes it; opening never steals it otherwise. */
export function fill(g: Grid, tile: number, channel: Channel): Grid {
  if (tile < 0 || tile >= g.tiles.length) return g;
  const tiles = g.tiles.map((c, i) => (i === tile ? channel : c));
  const soundOnEmpty = g.tiles[g.audible] == null;
  return { ...g, tiles, audible: soundOnEmpty ? tile : g.audible };
}

/** Empties [tile]; the grid shrinks from the end only, down to its opening size, so no tile moves. */
export function clear(g: Grid, tile: number, max: number): Grid {
  if (tile < 0 || tile >= g.tiles.length) return g;
  const tiles = g.tiles.map((c, i) => (i === tile ? null : c));
  while (tiles.length > openingTileCount(max) && tiles[tiles.length - 1] === null) tiles.pop();
  const audible = g.audible === tile ? Math.max(0, firstFilled(tiles)) : g.audible;
  return { tiles, focused: Math.min(g.focused, tiles.length - 1), audible };
}

/** OK on a filled tile gives it the sound; an empty or failed one cannot have it. */
export function giveSound(g: Grid, tile: number, failed: ReadonlySet<number> = new Set()): Grid {
  return g.tiles[tile] != null && !failed.has(tile) ? { ...g, audible: tile } : g;
}

/** A tile that failed loses the sound to the first other tile that plays; with none, nobody has it. */
export function silenceFailed(g: Grid, failed: ReadonlySet<number>): Grid {
  if (!failed.has(g.audible)) return g;
  const next = firstFilled(g.tiles, failed);
  return { ...g, audible: next >= 0 ? next : -1 };
}

// --- The provider's connection budget (Android's ConnectionBudget) ---

export type Refusal = { kind: "single" } | { kind: "all-in-use"; max: number };

/**
 * May one more stream open? [max] is the connections the provider allows (0 or less: unknown, everything is
 * allowed), [open] those already open on this playlist, tiles and recordings alike.
 */
export function connectionBudget(max: number, open: number): Refusal | null {
  if (!(max > 0) || open < max) return null;
  return max === 1 ? { kind: "single" } : { kind: "all-in-use", max };
}
