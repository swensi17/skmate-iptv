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

// The playlist form in a settings sheet: rows above, two small tabs, a wide field under them.
const form: Box[] = [
  { id: "row", x: 340, y: 308, w: 1048, h: 105 },
  { id: "edit", x: 1396, y: 308, w: 88, h: 105 },
  { id: "m3u", x: 348, y: 479, w: 193, h: 56 },
  { id: "xtream", x: 549, y: 479, w: 204, h: 56 },
  { id: "field", x: 340, y: 573, w: 1100, h: 105 },
];

describe("nextFocus on a form", () => {
  it("goes down from a wide row to the small tab right under it, not past it", () => {
    expect(nextFocus(form, "row", "down")).toBe("m3u");
    expect(nextFocus(form, "field", "up")).toBe("m3u");
  });
  it("moves between the tabs of one line", () => {
    expect(nextFocus(form, "m3u", "right")).toBe("xtream");
    expect(nextFocus(form, "xtream", "left")).toBe("m3u");
  });
  it("never leaps sideways to a far box on another line", () => {
    expect(nextFocus(form, "field", "right")).toBeNull();
    expect(nextFocus(form, "xtream", "right")).toBeNull();
  });
});
