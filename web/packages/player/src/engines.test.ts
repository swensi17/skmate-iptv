import { describe, expect, it } from "vitest";
import { defaultEngines } from "./index";

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
