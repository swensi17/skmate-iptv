import { describe, expect, it } from "vitest";
import { centerTop, clampIndex, revealTop, visibleWindow } from "./virtual";

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
  it("keeps a row of room ahead when asked (Android's edge scroll)", () => {
    expect(revealTop(0, 9, 100, 786, 1370, 1)).toBe(314); // row 9 ends at 1000, one row of room: 1100 minus the view
    expect(revealTop(500, 5, 100, 786, 1370, 1)).toBe(400); // row 5 starts at 500, one row of room above it
    expect(revealTop(0, 3, 100, 786, 1370, 1)).toBe(0); // already in view with room
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

describe("centerTop", () => {
  it("puts the row in the middle", () => {
    expect(centerTop(50, 84, 840, 100)).toBe(50 * 84 - (840 - 84) / 2);
  });
  it("stays inside the list at both ends", () => {
    expect(centerTop(0, 84, 840, 100)).toBe(0);
    expect(centerTop(2, 84, 840, 100)).toBe(0);
    expect(centerTop(99, 84, 840, 100)).toBe(100 * 84 - 840);
  });
  it("is zero when the list is shorter than the viewport", () => {
    expect(centerTop(3, 84, 840, 5)).toBe(0);
  });
});
