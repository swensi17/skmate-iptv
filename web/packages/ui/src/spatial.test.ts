import { describe, expect, it } from "vitest";
import { nextFocus, type Box } from "./spatial";

const rail: Box[] = [0, 1, 2].map((i) => ({ id: `r${i}`, x: 0, y: 100 + i * 100, w: 100, h: 80 }));
const list: Box[] = [0, 1, 2, 3].map((i) => ({ id: `c${i}`, x: 200, y: 100 + i * 90, w: 800, h: 80 }));
const all = [...rail, ...list];

describe("nextFocus", () => {
  it("moves down a list one row at a time", () => {
    expect(nextFocus(all, "c0", "down")).toBe("c1");
    expect(nextFocus(all, "c2", "up")).toBe("c1");
  });
  it("stops at the ends instead of jumping elsewhere", () => {
    expect(nextFocus(all, "c3", "down")).toBeNull();
    expect(nextFocus(all, "c0", "up")).toBeNull();
  });
  it("crosses from the list to the rail and back", () => {
    expect(nextFocus(all, "c1", "left")).toBe("r1");
    expect(nextFocus(all, "r1", "right")).toBe("c1");
  });
  it("lands on the first box when nothing is focused", () => {
    expect(nextFocus(all, null, "down")).toBe("r0");
    expect(nextFocus([], null, "down")).toBeNull();
  });
});
