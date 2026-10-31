import { describe, expect, it } from "vitest";
import { fitScale } from "./stage";

describe("fitScale", () => {
  it("is 1 on a 1920×1080 screen and shrinks to fit a smaller window", () => {
    expect(fitScale(1920, 1080)).toBe(1);
    expect(fitScale(960, 540)).toBe(0.5);
  });
  it("is limited by the tighter side", () => {
    expect(fitScale(1920, 540)).toBe(0.5);
    expect(fitScale(960, 1080)).toBe(0.5);
  });
  it("grows on a 4K screen and survives a zero-size window", () => {
    expect(fitScale(3840, 2160)).toBe(2);
    expect(fitScale(0, 0)).toBe(1);
  });
});
