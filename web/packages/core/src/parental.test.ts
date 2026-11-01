import { describe, expect, it } from "vitest";
import { hashPin, isAdultCategory, sha256Hex, validPin, verifyPin, visibleTo } from "./parental";

// The cases of the Android app's AdultCategoryClassifierTest, so both apps hide the same categories.
describe("isAdultCategory", () => {
  it("recognizes common provider adult category names", () => {
    for (const name of ["ADULT", "UK | Adults 18+", "XXX Movies", "Erotik", "Für Erwachsene", "Para Adultos", "Dla dorosłych", "Для взрослых", "للكبار", "成人频道", "성인"]) {
      expect(isAdultCategory(name), name).toBe(true);
    }
  });
  it("does not classify adult swim or ordinary categories as adult", () => {
    for (const name of ["Adult Swim", "US | Adult-Swim HD", "Kids", "Family Movies", "Channel 18", "Sports +1", ""]) {
      expect(isAdultCategory(name), name).toBe(false);
    }
  });
  it("classifies the category names seen on live panels", () => {
    expect(isAdultCategory("18| FOR ADULTS")).toBe(true);
    expect(isAdultCategory("NETFLIX ADULT-SWIM")).toBe(false);
    expect(isAdultCategory("HBO MAX (ADULT SWIM)")).toBe(false);
  });
  it("does not let the adult swim exception mask another marker", () => {
    expect(isAdultCategory("Adult Swim | XXX")).toBe(true);
  });
});

describe("visibleTo", () => {
  const list = [{ group: "Adults 18+" }, { group: "Family Movies" }];
  it("shows a normal profile everything and a kids profile no adult category", () => {
    expect(visibleTo(list, false)).toHaveLength(2);
    expect(visibleTo(list, true)).toEqual([{ group: "Family Movies" }]);
  });
});

describe("sha256Hex", () => {
  it("matches the standard test vectors", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(new TextEncoder().encode("a".repeat(1000)))).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
  });
});

describe("PIN", () => {
  const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  it("is stored as the Android app stores it: salt:sha256(salt+pin), hex", () => {
    // The expected value is Python's hashlib on the same bytes, computed apart from this code.
    expect(hashPin("1234", salt)).toBe("0102030405060708:ca5a65d6cd9d88cc63703811a33307250272e3d8c9f515e55dce92b005966632");
  });
  it("opens with the right PIN only", () => {
    const stored = hashPin("2468");
    expect(verifyPin("2468", stored)).toBe(true);
    expect(verifyPin("2469", stored)).toBe(false);
  });
  it("uses a fresh salt each time", () => {
    expect(hashPin("2468")).not.toBe(hashPin("2468"));
  });
  it("opens a profile without a PIN, and never a damaged one", () => {
    expect(verifyPin("0000", undefined)).toBe(true);
    expect(verifyPin("1234", "broken")).toBe(false);
    expect(verifyPin("1234", "zz:00")).toBe(false);
  });
  it("is 4 to 6 digits", () => {
    expect(["1234", "123456"].map(validPin)).toEqual([true, true]);
    expect(["123", "1234567", "12a4", ""].map(validPin)).toEqual([false, false, false, false]);
  });
});
