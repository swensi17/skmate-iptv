import { describe, expect, it } from "vitest";
import { capitalize } from "./text";

describe("capitalize", () => {
  it("raises the first letter only", () => {
    expect(capitalize("новости")).toBe("Новости");
    expect(capitalize("HD")).toBe("HD");
    expect(capitalize("")).toBe("");
  });
});
