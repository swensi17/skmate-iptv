import { describe, expect, it } from "vitest";
import { guidesForPlaylist } from "./guides";

describe("one feed named twice (#857)", () => {
  it("keeps .xml.gz and .xml of the same address once", () => {
    const g = guidesForPlaylist("YOSSO TV", null, ["http://epg.rapidnas.org/xmltv/epg.xml.gz", "http://epg.rapidnas.org/xmltv/epg.xml"]);
    expect(g.filter((x) => x.name === "YOSSO TV").map((x) => x.url)).toEqual(["http://epg.rapidnas.org/xmltv/epg.xml.gz"]);
  });
});

describe("the shared guides can be switched off", () => {
  it("drops it999 when asked", () => {
    expect(guidesForPlaylist("P", null, ["http://a/epg.xml"]).some((g) => g.url.includes("it999"))).toBe(true);
    expect(guidesForPlaylist("P", null, ["http://a/epg.xml"], false).some((g) => g.url.includes("it999"))).toBe(false);
  });
});
