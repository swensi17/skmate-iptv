import { describe, expect, it } from "vitest";
import { clock, floorHalfHour } from "./time";

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
