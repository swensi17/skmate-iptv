import { describe, expect, it } from "vitest";
import { flingStep, swipeOf } from "./touch";

describe("swipeOf", () => {
  it("a quick straight drag is a swipe in its direction", () => {
    expect(swipeOf(-120, 10, 200, 500, 960)?.dir).toBe("left");
    expect(swipeOf(120, -10, 200, 500, 960)?.dir).toBe("right");
    expect(swipeOf(5, 140, 200, 500, 960)?.dir).toBe("down");
    expect(swipeOf(0, -140, 200, 500, 960)?.dir).toBe("up");
  });
  it("short, slow or diagonal drags are not swipes", () => {
    expect(swipeOf(30, 0, 100, 500, 960)).toBeNull();
    expect(swipeOf(200, 0, 900, 500, 960)).toBeNull();
    expect(swipeOf(120, 100, 200, 500, 960)).toBeNull();
  });
  it("knows a swipe that starts at an edge", () => {
    expect(swipeOf(120, 0, 200, 10, 960)?.fromEdge).toBe("left");
    expect(swipeOf(-120, 0, 200, 950, 960)?.fromEdge).toBe("right");
    expect(swipeOf(120, 0, 200, 300, 960)?.fromEdge).toBeNull();
  });
});

describe("flingStep", () => {
  it("slows down and covers less distance than at constant speed", () => {
    const s = flingStep(2, 16);
    expect(s.v).toBeLessThan(2);
    expect(s.dist).toBeGreaterThan(0);
    expect(s.dist).toBeLessThan(2 * 16);
    expect(flingStep(0, 16).dist).toBe(0);
  });
  it("is almost still after a second", () => {
    expect(Math.abs(flingStep(3, 1000).v)).toBeLessThan(0.01);
  });
});
