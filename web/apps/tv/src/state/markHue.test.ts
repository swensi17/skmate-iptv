import { describe, expect, it } from "vitest";
import { markHue } from "./settings";

describe("markHue", () => {
  it("keeps the brand blue for no accent, grey, black and white", () => {
    for (const a of [null, "#F2F0ED", "#121212", "#FFFFFF", "#000000"]) expect(markHue(a)).toBeNull();
  });
  it("takes a coloured accent", () => {
    expect(markHue("#FFB95C")).toBe("#FFB95C");
    expect(markHue("#52DBC8")).toBe("#52DBC8");
  });
});
