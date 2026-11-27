import { describe, expect, it } from "vitest";
import { PIN_MAX, PIN_MIN, pinInput } from "./PinDialog";

describe("PIN field (ProfileComponents.kt PinDialog)", () => {
  it("takes digits only, up to six; anything else is dropped", () => {
    expect(PIN_MIN).toBe(4);
    expect(PIN_MAX).toBe(6);
    expect(pinInput("")).toBe("");
    expect(pinInput("123456")).toBe("123456");
    expect(pinInput("1234567")).toBeNull();
    expect(pinInput("12a4")).toBeNull();
    expect(pinInput("12 4")).toBeNull();
  });
});
