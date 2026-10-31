import { describe, expect, it } from "vitest";
import { defaultEngines } from "./index";

describe("defaultEngines", () => {
  it("tries the TV's own decoder first, then hls.js", () => {
    expect(defaultEngines().map((e) => e.id)).toEqual(["native", "hlsjs"]);
  });
  it("honours a chosen engine", () => {
    expect(defaultEngines({ preference: "native" }).map((e) => e.id)).toEqual(["native"]);
    expect(defaultEngines({ preference: "hls" }).map((e) => e.id)).toEqual(["hlsjs"]);
  });
});
