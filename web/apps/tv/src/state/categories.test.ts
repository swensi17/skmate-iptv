import { describe, expect, it } from "vitest";
import { arrangeCategories, hideCategory, moveItem, restorePlan } from "./categories";

const g = (...n: string[]) => n.map((name) => ({ name }));
describe("home categories (hide / move / restore)", () => {
  it("hidden ones leave the list, the saved order comes first", () => {
    const s = hideCategory({ hidden: [], order: ["c", "a"] }, "b");
    expect(arrangeCategories(g("a", "b", "c", "d"), s).map((x) => x.name)).toEqual(["c", "a", "d"]);
  });
  it("moving a carried row", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 5)).toEqual(["a", "b", "c"]);
  });
  it("restore plan counts what comes back", () => {
    expect(restorePlan({ hidden: ["a", "b"], order: [] })).toEqual({ hidden: 2, order: false });
    expect(restorePlan({ hidden: [], order: ["a"] })).toEqual({ hidden: 0, order: true });
  });
});
