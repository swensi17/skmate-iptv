import { describe, expect, it } from "vitest";
import { relinkLegacy } from "./useGuide";

describe("a guide linked by place in the list (before 2.7.0)", () => {
  const meta = { v: 3, gen: 1, at: 1, days: 7, links: [["0", "perviy"], ["1", "ntv"]], logos: [], ids: [], blocks: [], until: 0 } as never;
  it("moves its links to the lasting ids of the same entries, so it shows at once", () => {
    const out = relinkLegacy(meta, () => [{ id: "c1" }, { id: "c2" }]);
    expect(out.links).toEqual([["c1", "perviy"], ["c2", "ntv"]]);
  });
  it("is left as it is without a kept list, or when already lasting", () => {
    expect(relinkLegacy(meta, () => null)).toBe(meta);
    const fresh = { ...(meta as object), links: [["c1", "perviy"]] } as never;
    expect(relinkLegacy(fresh, () => [{ id: "x" }])).toBe(fresh);
  });
});
