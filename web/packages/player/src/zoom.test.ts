import { describe, expect, it } from "vitest";
import { defaultZoom, ZOOM_CROP_FACTOR, ZOOM_MODES, zoomLook, zoomTransform } from "./zoom";
import { ItemPrefsStore } from "./memory";

const STAGE = { w: 1728, h: 972 }; // 16:9

describe("zoomLook (VideoZoom.kt)", () => {
  it("has Android's six modes in its order", () => {
    expect(ZOOM_MODES).toEqual(["fit", "crop", "stretch", "original", "16_9", "4_3"]);
  });
  it("fit letterboxes, stretch fills, both without a scale", () => {
    expect(zoomLook("fit", { w: 720, h: 576 }, STAGE)).toEqual({ objectFit: "contain", scaleX: 1, scaleY: 1 });
    expect(zoomLook("stretch", { w: 720, h: 576 }, STAGE)).toEqual({ objectFit: "fill", scaleX: 1, scaleY: 1 });
    expect(zoomLook("stretch", null, STAGE).objectFit).toBe("fill");
  });
  it("crop enlarges the fit box by 1.2 even when the shapes already match", () => {
    expect(zoomLook("crop", { w: 1920, h: 1080 }, STAGE)).toEqual({ objectFit: "contain", scaleX: ZOOM_CROP_FACTOR, scaleY: ZOOM_CROP_FACTOR });
  });
  it("original shows one stream pixel per screen pixel", () => {
    // A 1280×720 picture on a 1728-wide stage drawn 1:1 to a 1920 screen (1.111 screen px per CSS px):
    // the fit box is 1728 wide; 1280 screen px = 1152 CSS px → 1152 / 1728.
    const l = zoomLook("original", { w: 1280, h: 720 }, STAGE, 1920 / 1728);
    expect(l.scaleX).toBeCloseTo(1152 / 1728, 5);
    expect(l.scaleY).toBeCloseTo(l.scaleX, 9);
    // A 4:3 SD picture: the fit box is 1296 wide (972 × 4/3), 720 px at 1 px per px → 720 / 1296.
    expect(zoomLook("original", { w: 720, h: 540 }, STAGE).scaleX).toBeCloseTo(720 / 1296, 5);
  });
  it("forced shapes stretch the picture into the largest box of that shape", () => {
    expect(zoomLook("16_9", { w: 720, h: 576 }, STAGE)).toEqual({ objectFit: "fill", scaleX: 1, scaleY: 1 });
    const four = zoomLook("4_3", { w: 1920, h: 1080 }, STAGE);
    expect(four.objectFit).toBe("fill");
    expect(four.scaleX).toBeCloseTo(1296 / 1728, 5);
    expect(four.scaleY).toBe(1);
    // On a screen taller than 16:9 the 16:9 box is width-driven.
    const tall = zoomLook("16_9", { w: 720, h: 576 }, { w: 1000, h: 1000 });
    expect(tall.scaleX).toBe(1);
    expect(tall.scaleY).toBeCloseTo(562.5 / 1000, 5);
  });
  it("before the first frame every mode but stretch fits", () => {
    for (const m of ["crop", "original", "16_9", "4_3"] as const) expect(zoomLook(m, null, STAGE)).toEqual({ objectFit: "contain", scaleX: 1, scaleY: 1 });
  });
  it("writes no transform for a scale of 1", () => {
    expect(zoomTransform({ objectFit: "contain", scaleX: 1, scaleY: 1 })).toBe("none");
    expect(zoomTransform({ objectFit: "contain", scaleX: 1.2, scaleY: 1.2 })).toBe("scale(1.2, 1.2)");
    expect(zoomTransform({ objectFit: "fill", scaleX: 0.75, scaleY: 1 })).toBe("scale(0.75, 1)");
  });
});

describe("defaultZoom", () => {
  it("takes Settings' default zoom when the older aspect field agrees with it", () => {
    expect(defaultZoom("fit", "fit")).toBe("fit");
    expect(defaultZoom("crop", "cover")).toBe("crop");
    expect(defaultZoom("stretch", "fill")).toBe("stretch");
    expect(defaultZoom("original", "fit")).toBe("original");
    expect(defaultZoom("4_3", "fit")).toBe("4_3");
  });
  it("follows the aspect when the player sheet changed it later", () => {
    expect(defaultZoom("fit", "cover")).toBe("crop");
    expect(defaultZoom("original", "fill")).toBe("stretch");
    expect(defaultZoom("crop", "fit")).toBe("fit");
    expect(defaultZoom("nonsense", "fill")).toBe("stretch");
  });
});

describe("ItemPrefsStore (PlaybackPrefsStore)", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return new ItemPrefsStore(() => ({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }));
  };
  it("remembers zoom and track languages per item", () => {
    const s = memory();
    s.rememberZoom("ch:1", "4_3");
    s.rememberAudio("ch:1", "eng");
    s.rememberSubtitle("ch:1", "off");
    expect(s.get("ch:1")).toMatchObject({ zoom: "4_3", audio: "eng", sub: "off" });
    expect(s.get("ch:2")).toBeNull();
    expect(s.get("")).toBeNull();
  });
  it("does not remember a blank language", () => {
    const s = memory();
    s.rememberAudio("ch:1", "");
    expect(s.get("ch:1")).toBeNull();
  });
  it("clears every saved zoom and keeps the track choices", () => {
    const s = memory();
    s.rememberZoom("a", "crop");
    s.rememberZoom("b", "fit");
    s.rememberAudio("b", "ru");
    expect(s.zoomCount()).toBe(2);
    s.clearZoom();
    expect(s.zoomCount()).toBe(0);
    expect(s.get("a")).toBeNull();
    expect(s.get("b")).toMatchObject({ audio: "ru" });
  });
  it("survives storage that throws or holds garbage", () => {
    const broken = new ItemPrefsStore(() => ({ getItem: () => "{not json", setItem: () => { throw new Error("full"); } }));
    expect(broken.get("x")).toBeNull();
    expect(() => broken.rememberZoom("x", "fit")).not.toThrow();
    expect(new ItemPrefsStore(() => null).get("x")).toBeNull();
  });
});
