import { describe, expect, it } from "vitest";
import { buildBackup, clearCaches, parseBackup, restoreBackup } from "./backup";

function fakeStore(initial: Record<string, string>) {
  const m = new Map(Object.entries(initial));
  return {
    get length() { return m.size; },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    keys: () => Array.from(m.keys()),
  };
}

describe("backup", () => {
  const data = {
    "skmate.settings.v1": "{}", "skmate.playlists.v1": "[1]", "skmate.favorites.v1@p1": "[]",
    "skmate.cache.1": "BIG", "skmate.epg.1": "BIG", "other.app": "x",
  };
  it("keeps the viewer's choices and leaves out caches and strangers", () => {
    const b = buildBackup(fakeStore(data), 5);
    expect(Object.keys(b.items).sort()).toEqual(["skmate.favorites.v1@p1", "skmate.playlists.v1", "skmate.settings.v1"]);
    expect(b.at).toBe(5);
  });
  it("round-trips through text and restores into a store", () => {
    const text = JSON.stringify(buildBackup(fakeStore(data)));
    const back = parseBackup(text);
    expect(back).not.toBeNull();
    const target = fakeStore({});
    expect(restoreBackup(back!, target)).toBe(3);
    expect(target.getItem("skmate.playlists.v1")).toBe("[1]");
  });
  it("refuses a file that is not ours or carries foreign keys", () => {
    expect(parseBackup("not json")).toBeNull();
    expect(parseBackup('{"app":"other","version":1,"items":{}}')).toBeNull();
    const sneaky = parseBackup('{"app":"skmate-web","version":1,"items":{"evil.key":"x","skmate.settings.v1":"{}"}}');
    expect(Object.keys(sneaky!.items)).toEqual(["skmate.settings.v1"]);
  });
  it("clears only the caches", () => {
    const s = fakeStore(data);
    expect(clearCaches(s)).toBe(2);
    expect(s.keys().sort()).toEqual(["other.app", "skmate.favorites.v1@p1", "skmate.playlists.v1", "skmate.settings.v1"]);
  });
});
