import { describe, expect, it } from "vitest";
import { clock, floorHalfHour, left } from "./time";

describe("time", () => {
  it("formats a clock with leading zeros", () => {
    expect(clock(new Date(2026, 9, 31, 5, 3).getTime())).toBe("05:03");
  });
  it("rounds down to the half hour", () => {
    const t = new Date(2026, 9, 31, 10, 47).getTime();
    expect(floorHalfHour(t)).toBe(new Date(2026, 9, 31, 10, 30).getTime() + (floorHalfHour(t) - Math.floor(floorHalfHour(t) / 1800000) * 1800000));
    expect(floorHalfHour(t) % 1_800_000).toBe(0);
    expect(floorHalfHour(t)).toBeLessThanOrEqual(t);
  });
});

describe("left", () => {
  it("counts the minutes that remain, rounding up", () => {
    expect(left(24 * 60_000)).toEqual({ h: 0, m: 24 });
    expect(left(24 * 60_000 - 1)).toEqual({ h: 0, m: 24 });
    expect(left(65 * 60_000)).toEqual({ h: 1, m: 5 });
    expect(left(60 * 60_000)).toEqual({ h: 1, m: 0 });
  });
  it("is null once the programme is over", () => {
    expect(left(0)).toBeNull();
    expect(left(-5)).toBeNull();
  });
});
