import { describe, expect, it } from "vitest";
import { bufferFor, interestRank } from "./interests";

describe("first-run answers", () => {
  it("lifts the categories the viewer likes", () => {
    expect(interestRank("Спорт", ["sport"])).toBe(0);
    expect(interestRank("Футбол и спорт", ["sport"])).toBe(0);
    expect(interestRank("Кино", ["sport"])).toBe(1);
    expect(interestRank("Новости", [])).toBe(1);
  });
  it("gives a weak connection the larger buffer", () => {
    expect(bufferFor("weak")).toBe(60);
    expect(bufferFor("normal")).toBe(30);
    expect(bufferFor("fast")).toBe(10);
  });
});
