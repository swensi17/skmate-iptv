import { describe, expect, it } from "vitest";
import { addProfile, firstBook, removeProfile, switchProfile } from "./scope";

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
