import { describe, expect, it } from "vitest";
import { guidesForPlaylist } from "./guides";

describe("one feed named twice (#857)", () => {
  it("keeps .xml.gz and .xml of the same address once", () => {
    const g = guidesForPlaylist("YOSSO TV", null, ["http://epg.rapidnas.org/xmltv/epg.xml.gz", "http://epg.rapidnas.org/xmltv/epg.xml"]);
    expect(g.filter((x) => x.name === "YOSSO TV").map((x) => x.url)).toEqual(["http://epg.rapidnas.org/xmltv/epg.xml.gz"]);
  });
});
