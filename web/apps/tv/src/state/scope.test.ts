import { describe, expect, it } from "vitest";
import { addProfile, firstBook, removeProfile, setKids, setPinHash, switchProfile } from "./scope";

describe("profiles", () => {
  it("starts with one profile, a guest or a named person", () => {
    expect(firstBook("Гость", true).profiles[0]).toEqual({ id: "main", name: "Гость", guest: true });
    expect(firstBook("Амир", false).profiles[0]).toEqual({ id: "main", name: "Амир" });
  });
  it("adds profiles with their own ids and ignores an empty name", () => {
    const b = addProfile(addProfile(firstBook("А", false), "Мама"), "Дети");
    expect(b.profiles.map((p) => p.name)).toEqual(["А", "Мама", "Дети"]);
    expect(new Set(b.profiles.map((p) => p.id)).size).toBe(3);
    expect(addProfile(b, "  ")).toBe(b);
  });
  it("never removes the active profile", () => {
    const b = addProfile(firstBook("А", false), "Мама");
    expect(removeProfile(b, "main")).toBe(b);
    expect(removeProfile(b, "p1").profiles).toHaveLength(1);
  });
  it("switches only to a profile that exists", () => {
    const b = addProfile(firstBook("А", false), "Мама");
    expect(switchProfile(b, "p1").activeId).toBe("p1");
    expect(switchProfile(b, "zzz").activeId).toBe("main");
  });
});

describe("locks and kids", () => {
  const book = addProfile(firstBook("Мама", false), "Сын");
  it("locks a profile with a PIN hash and unlocks it, touching no other profile", () => {
    const locked = setPinHash(book, "p1", "aa:bb");
    expect(locked.profiles.map((p) => p.pinHash)).toEqual([undefined, "aa:bb"]);
    expect(setPinHash(locked, "p1", null).profiles[1]).toEqual({ id: "p1", name: "Сын" });
  });
  it("makes a profile a kids profile and back", () => {
    const kids = setKids(book, "p1", true);
    expect(kids.profiles[1]?.kids).toBe(true);
    expect(setKids(kids, "p1", false).profiles[1]).toEqual({ id: "p1", name: "Сын" });
  });
});
