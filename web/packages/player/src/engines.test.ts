import { describe, expect, it } from "vitest";
import { defaultEngines } from "./index";
import { capLevelFor, looksLikeHls } from "./engines/hls";

describe("defaultEngines", () => {
  it("tries the TV's own decoder first, then hls.js", () => {
    expect(defaultEngines().map((e) => e.id)).toEqual(["native", "hlsjs", "mpegts"]);
  });
  it("honours a chosen engine", () => {
    expect(defaultEngines({ preference: "native" }).map((e) => e.id)).toEqual(["native"]);
    expect(defaultEngines({ preference: "hls" }).map((e) => e.id)).toEqual(["hlsjs"]);
    expect(defaultEngines({ preference: "mpegts" }).map((e) => e.id)).toEqual(["mpegts"]);
  });
  it("timeshifts on hls.js alone: the only engine that can open a live stream behind its edge", () => {
    expect(defaultEngines({ liveBehindSeconds: 40 }).map((e) => e.id)).toEqual(["hlsjs"]);
    expect(defaultEngines({ preference: "native", liveBehindSeconds: 40 }).map((e) => e.id)).toEqual(["hlsjs"]);
  });
});

describe("looksLikeHls", () => {
  it("takes .m3u8 and addresses that name no file type, not .ts or other files", () => {
    expect(looksLikeHls("http://h/live/1.m3u8?token=x")).toBe(true);
    expect(looksLikeHls("http://127.0.0.1:47817/s/abc/live/7?cmd=ffrt%20http%3A%2F%2Flocalhost%2Fch%2F7_")).toBe(true);
    expect(looksLikeHls("http://h/play/123")).toBe(true);
    expect(looksLikeHls("http://h/live/1.ts")).toBe(false);
    expect(looksLikeHls("http://h/movie.mp4")).toBe(false);
    expect(looksLikeHls("not a url")).toBe(false);
  });
});

describe("capLevelFor", () => {
  it("takes the best level that fits, else the lowest", () => {
    expect(capLevelFor([360, 540, 720, 1080], 720)).toBe(2);
    expect(capLevelFor([1080, 720, 360], 720)).toBe(1);
    expect(capLevelFor([1080, 2160], 720)).toBe(0);
    expect(capLevelFor([2160, 1080], 720)).toBe(1);
    expect(capLevelFor([0, 0], 720)).toBe(0);
    expect(capLevelFor([], 720)).toBe(0);
  });
  it("puts hls.js first when a height is capped", () => {
    expect(defaultEngines({ maxHeight: 720 }).map((e) => e.id)).toEqual(["hlsjs", "native", "mpegts"]);
    expect(defaultEngines({ maxHeight: 720, preference: "native" }).map((e) => e.id)).toEqual(["native"]);
  });
});
