import { afterEach, describe, expect, it } from "vitest";
import { createPager, pagingDirection, pagingTarget, setChNavConfig, getChNavConfig, clampSkip } from "./chNav";

const key = (keyCode: number, k = "") => ({ key: k, keyCode });

afterEach(() => setChNavConfig({ enabled: true, up: 10, down: 10 }));

describe("CH+/CH- paging (ChNavPaging.kt)", () => {
  it("CH+ and rewind go toward the first row, CH- and fast-forward toward the last", () => {
    expect(pagingDirection(key(427))).toBe(-1);
    expect(pagingDirection(key(33))).toBe(-1);
    expect(pagingDirection(key(412))).toBe(-1);
    expect(pagingDirection(key(428))).toBe(1);
    expect(pagingDirection(key(417))).toBe(1);
    expect(pagingDirection(key(0, "MediaFastForward"))).toBe(1);
    expect(pagingDirection(key(40, "ArrowDown"))).toBe(0);
  });
  it("pages by the skip, a long press jumps to the end, all kept inside the list", () => {
    const cfg = { enabled: true, up: 7, down: 12 };
    expect(pagingTarget(1, false, 3, 99, cfg)).toBe(15);
    expect(pagingTarget(-1, false, 3, 99, cfg)).toBe(0);
    expect(pagingTarget(1, false, 95, 99, cfg)).toBe(99);
    expect(pagingTarget(-1, true, 50, 99, cfg)).toBe(0);
    expect(pagingTarget(1, true, 50, 99, cfg)).toBe(99);
    expect(pagingTarget(1, true, 50, 99, cfg, false)).toBe(50); // the "All" list: no jump to the end
  });
  it("acts when the key comes up: short press pages, 600 ms jumps", () => {
    const t = { now: 1000 };
    const pager = createPager(() => t.now);
    expect(pager.down(key(428))).toBe(true);
    t.now = 1100;
    expect(pager.down({ ...key(428) })).toBe(true); // a repeat keeps the first time
    expect(pager.up(key(428), 5, 100)).toEqual({ handled: true, to: 15 });
    expect(pager.down(key(427))).toBe(true);
    t.now = 2000;
    expect(pager.up(key(427), 50, 100)).toEqual({ handled: true, to: 0 });
  });
  it("does nothing when Remote buttons are off, or the key did not go down here", () => {
    const pager = createPager();
    expect(pager.up(key(428), 5, 100)).toEqual({ handled: false, to: null });
    setChNavConfig({ enabled: false });
    expect(pager.down(key(428))).toBe(false);
  });
  it("no move when already at the target", () => {
    const pager = createPager(() => 0);
    pager.down(key(427));
    expect(pager.up(key(427), 0, 100)).toEqual({ handled: true, to: null });
  });
  it("keeps the skip between 1 and 1000", () => {
    expect(clampSkip(0)).toBe(1);
    expect(clampSkip(5000)).toBe(1000);
    expect(clampSkip("x")).toBe(10);
    setChNavConfig({ up: 3, down: 4 });
    expect(getChNavConfig()).toEqual({ enabled: true, up: 3, down: 4 });
  });
});
