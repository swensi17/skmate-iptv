import { describe, expect, it } from "vitest";
import { fitScale, stageOffset } from "./stage";

// The design box is 1728×972 (Android mpx at its default 100% UI zoom), so a 1920×1080 TV draws it ×1.111.
describe("fitScale", () => {
  it("fills a 1920×1080 TV as Android does at 100% zoom, and shrinks to fit a smaller window", () => {
    expect(fitScale(1920, 1080)).toBeCloseTo(1920 / 1728, 6);
    expect(fitScale(864, 486)).toBe(0.5);
  });
  it("is limited by the tighter side", () => {
    expect(fitScale(1920, 486)).toBe(0.5);
    expect(fitScale(864, 1080)).toBe(0.5);
  });
  it("draws a window a pixel off the design box unscaled", () => {
    expect(fitScale(1727, 971)).toBe(1);
    expect(fitScale(1729, 972)).toBe(1);
  });
  it("grows on a 4K screen and survives a zero-size window", () => {
    expect(fitScale(3840, 2160)).toBeCloseTo(3840 / 1728, 6);
    expect(fitScale(0, 0)).toBe(1);
  });
});

describe("stageOffset", () => {
  it("centres the box on whole pixels, so an odd window does not blur it", () => {
    expect(stageOffset(1728, 972)).toEqual({ left: 0, top: 0 });
    expect(stageOffset(1920, 1080)).toEqual({ left: 96, top: 54 });
    expect(stageOffset(864, 486)).toEqual({ left: -432, top: -243 });
  });
});
