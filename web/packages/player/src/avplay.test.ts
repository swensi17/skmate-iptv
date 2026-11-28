import { describe, expect, it } from "vitest";
import { avTrackOption, defaultEngines } from "./index";

describe("AVPlay tracks (#822)", () => {
  it("reads the language from extra_info", () => {
    expect(avTrackOption({ index: 3, type: "AUDIO", extra_info: '{"fourCC":"AC3","language":"rus"}' }, 0, true)).toEqual({ id: 3, label: "rus", lang: "rus", selected: true });
    expect(avTrackOption({ index: 4, type: "AUDIO", extra_info: "{language: eng, bit_rate: 1}" }, 1, false).lang).toBe("eng");
    expect(avTrackOption({ index: 5, type: "AUDIO", extra_info: "" }, 2, false).label).toBe("3");
  });
  it("is asked for only, with the TV's decoder behind it", () => {
    expect(defaultEngines({ preference: "avplay" }).map((e) => e.id)).toEqual(["avplay", "native"]);
    expect(defaultEngines().map((e) => e.id)).not.toContain("avplay");
  });
});
