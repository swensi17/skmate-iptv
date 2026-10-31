import { describe, expect, it } from "vitest";
import { clampIndex, revealTop, visibleWindow } from "./virtual";

describe("visibleWindow", () => {
  it("draws the viewport plus a buffer, never the whole list", () => {
    const w = visibleWindow(0, 840, 84, 3163);
    expect(w).toEqual({ first: 0, last: 13 });
    const mid = visibleWindow(84 * 1000, 840, 84, 3163);
    expect(mid.last - mid.first).toBeLessThan(20);
    expect(mid.first).toBe(997);
  });
  it("stops at the end and handles an empty list", () => {
    expect(visibleWindow(84 * 3150, 840, 84, 3163).last).toBe(3162);
    expect(visibleWindow(0, 840, 84, 0)).toEqual({ first: 0, last: -1 });
  });
});

describe("revealTop", () => {
  it("does not move when the row is already visible", () => {
    expect(revealTop(0, 5, 84, 840, 100)).toBe(0);
  });
  it("scrolls the least amount to show a row below or above", () => {
    expect(revealTop(0, 10, 84, 840, 100)).toBe(84);
    expect(revealTop(840, 5, 84, 840, 100)).toBe(420);
  });
  it("stays inside the list", () => {
    expect(revealTop(0, 99, 84, 840, 100)).toBe(100 * 84 - 840);
    expect(revealTop(0, 0, 84, 840, 3)).toBe(0);
  });
});

describe("clampIndex", () => {
  it("moves by a page and stops at the ends", () => {
    expect(clampIndex(5, 10, 100)).toBe(15);
    expect(clampIndex(95, 10, 100)).toBe(99);
    expect(clampIndex(3, -10, 100)).toBe(0);
  });
});
