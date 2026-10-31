import { describe, expect, it } from "vitest";
import { capitalize, hueOf, monogram } from "./text";

describe("capitalize", () => {
  it("raises the first letter only", () => {
    expect(capitalize("новости")).toBe("Новости");
    expect(capitalize("HD")).toBe("HD");
    expect(capitalize("")).toBe("");
  });
});

describe("channel badges", () => {
  it("takes the first letters of the first two words", () => {
    expect(monogram("Первый канал HD")).toBe("ПК");
    expect(monogram("BBC Scotland HD UK")).toBe("BS");
    expect(monogram("Россия 1 UHD")).toBe("РО");
    expect(monogram("НТВ UHD")).toBe("НТ");
    expect(monogram("360")).toBe("3");
  });
  it("always gives the same colour to the same name", () => {
    expect(hueOf("Матч ТВ")).toBe(hueOf("Матч ТВ"));
    expect(hueOf("Матч ТВ")).toBeGreaterThanOrEqual(0);
    expect(hueOf("Матч ТВ")).toBeLessThan(360);
  });
});
