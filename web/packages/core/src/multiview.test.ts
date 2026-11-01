import { describe, expect, it } from "vitest";
import type { Channel } from "./m3u/parse";
import {
  addTile, canAddTile, clampTiles, clear, connectionBudget, fill, gridFrom, giveSound, openGrid, openingTileCount, rowsOf, silenceFailed,
} from "./multiview";

const ch = (id: string): Channel => ({ id, name: `Канал ${id}`, url: `http://h/${id}.m3u8`, group: "" });

describe("the grid", () => {
  it("opens with two tiles, or one when that is all the setting allows, the playing channel first and with the sound", () => {
    expect(openingTileCount(4)).toBe(2);
    expect(openingTileCount(1)).toBe(1);
    const g = openGrid(ch("a"), 4);
    expect(g.tiles.map((c) => c?.id ?? null)).toEqual(["a", null]);
    expect([g.focused, g.audible]).toEqual([0, 0]);
    expect(openGrid(ch("a"), 1).tiles).toHaveLength(1);
  });
  it("lays the tiles in rows of two: one lone tile keeps its cell", () => {
    expect(rowsOf(1)).toEqual([[0]]);
    expect(rowsOf(2)).toEqual([[0, 1]]);
    expect(rowsOf(3)).toEqual([[0, 1], [2]]);
    expect(rowsOf(4)).toEqual([[0, 1], [2, 3]]);
  });
  it("keeps the number of tiles between 1 and 4", () => {
    expect([0, 1, 2, 4, 9].map(clampTiles)).toEqual([2, 1, 2, 4, 4]);
    expect(clampTiles(Number.NaN)).toBe(2);
  });
  it("adds a tile only below the ceiling, and focuses it", () => {
    let g = openGrid(ch("a"), 3);
    expect(canAddTile(g, 3)).toBe(true);
    g = addTile(g, 3);
    expect([g.tiles.length, g.focused]).toEqual([3, 2]);
    expect(canAddTile(g, 3)).toBe(false);
    expect(addTile(g, 3)).toBe(g);
  });
  it("fills the kept channels after the playing one, once each, up to the ceiling", () => {
    const g = gridFrom(ch("b"), [ch("a"), ch("b"), ch("c"), ch("d"), ch("e")], 4);
    expect(g.tiles.map((c) => c?.id)).toEqual(["b", "a", "c", "d"]);
    expect(gridFrom(ch("a"), [], 4).tiles.map((c) => c?.id ?? null)).toEqual(["a", null]);
  });
});

describe("the sound", () => {
  it("is on one tile; filling another does not take it, OK on a filled tile does", () => {
    let g = fill(openGrid(ch("a"), 4), 1, ch("b"));
    expect(g.audible).toBe(0);
    g = giveSound(g, 1);
    expect(g.audible).toBe(1);
    g = addTile(g, 4);
    expect(giveSound(g, 2).audible).toBe(1); // an empty tile cannot have it
  });
  it("goes to the first channel that fills a grid whose sound tile is empty", () => {
    let g = openGrid(ch("a"), 4);
    g = clear(g, 0, 4);
    expect(g.audible).toBe(0);
    g = fill(g, 1, ch("b"));
    expect(g.audible).toBe(1);
  });
  it("moves off a failed tile to the first one that plays, and to nobody when none does", () => {
    let g = fill(openGrid(ch("a"), 4), 1, ch("b"));
    expect(silenceFailed(g, new Set([0])).audible).toBe(1);
    expect(silenceFailed(g, new Set([0, 1])).audible).toBe(-1);
    expect(silenceFailed(g, new Set([1])).audible).toBe(0);
    expect(giveSound(g, 1, new Set([1])).audible).toBe(0);
  });
  it("on clearing the tile that had it goes to the first filled tile", () => {
    let g = fill(fill(openGrid(ch("a"), 4), 1, ch("b")), 1, ch("b"));
    g = giveSound(g, 1);
    g = clear(g, 1, 4);
    expect(g.audible).toBe(0);
  });
});

describe("removing a tile", () => {
  it("shrinks from the end only, down to the opening size, so no tile moves", () => {
    let g = openGrid(ch("a"), 4);
    g = fill(addTile(addTile(g, 4), 4), 3, ch("d"));
    g = fill(g, 1, ch("b"));
    expect(g.tiles.map((c) => c?.id ?? null)).toEqual(["a", "b", null, "d"]);
    g = clear(g, 1, 4); // in the middle: it stays as an empty tile
    expect(g.tiles.map((c) => c?.id ?? null)).toEqual(["a", null, null, "d"]);
    g = clear(g, 3, 4); // the end goes, and the empty ones before it with it, down to two
    expect(g.tiles.map((c) => c?.id ?? null)).toEqual(["a", null]);
  });
});

// The cases of the Android app's ConnectionBudgetTest.
describe("the provider's connections", () => {
  it("allows everything when the limit is unknown", () => {
    expect(connectionBudget(0, 4)).toBeNull();
    expect(connectionBudget(-1, 9)).toBeNull();
  });
  it("one connection: the first tile tunes, the second explains", () => {
    expect(connectionBudget(1, 0)).toBeNull();
    expect(connectionBudget(1, 1)).toEqual({ kind: "single" });
  });
  it("two connections fill two tiles and refuse the third, and so on up to four", () => {
    expect(connectionBudget(2, 1)).toBeNull();
    expect(connectionBudget(2, 2)).toEqual({ kind: "all-in-use", max: 2 });
    expect(connectionBudget(3, 2)).toBeNull();
    expect(connectionBudget(3, 3)).toEqual({ kind: "all-in-use", max: 3 });
    expect(connectionBudget(4, 3)).toBeNull();
    expect(connectionBudget(4, 4)).toEqual({ kind: "all-in-use", max: 4 });
  });
  it("more connections than tiles is never a problem", () => {
    expect(connectionBudget(10, 4)).toBeNull();
  });
});
