import { describe, expect, it } from "vitest";
import { fitScale, stageOffset } from "./stage";

describe("fitScale", () => {
  it("is 1 on a 1920×1080 screen and shrinks to fit a smaller window", () => {
    expect(fitScale(1920, 1080)).toBe(1);
    expect(fitScale(960, 540)).toBe(0.5);
  });
  it("is limited by the tighter side", () => {
    expect(fitScale(1920, 540)).toBe(0.5);
    expect(fitScale(960, 1080)).toBe(0.5);
  });
  it("draws a window a pixel off 1920×1080 unscaled", () => {
    expect(fitScale(1919, 1079)).toBe(1);
    expect(fitScale(1921, 1080)).toBe(1);
  });
  it("grows on a 4K screen and survives a zero-size window", () => {
    expect(fitScale(3840, 2160)).toBe(2);
    expect(fitScale(0, 0)).toBe(1);
  });
});

describe("stageOffset", () => {
  it("centres the box on whole pixels, so an odd window does not blur it", () => {
    expect(stageOffset(1920, 1080)).toEqual({ left: 0, top: 0 });
    expect(stageOffset(2015, 1080)).toEqual({ left: 48, top: 0 });
    expect(stageOffset(960, 540)).toEqual({ left: -480, top: -270 });
  });
});
