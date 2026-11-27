import { describe, expect, it } from "vitest";
import type { Channel } from "@skmate/core";
import { favKey, isFavorite, migrateFavorites, toggle } from "./favorites";

const ch = (id: string, name: string, tvgId?: string, url = `http://p/live/u/p/${id}.ts`): Channel => ({ id, name, url, group: "", ...(tvgId ? { tvgId } : {}) });

describe("favourites (2.6.2)", () => {
  // An Xtream provider that gives one tvg-id (and even one name) to a whole group.
  const group = Array.from({ length: 12 }, (_, i) => ch(String(i), i === 0 ? "MusicBox 80s" : "MusicBox", "musicbox"));
  const twins = [ch("a", "Eurodance 90 HD", "music"), ch("b", "Eurodance 90 HD", "music")];

  it("one heart lights one channel, never the rest of its tvg-id or a twin of its name", () => {
    const favs = toggle(new Set(), favKey(group[0] as Channel));
    expect(group.filter((c) => isFavorite(favs, c))).toEqual([group[0]]);
    const two = toggle(new Set(), favKey(twins[0] as Channel));
    expect(twins.filter((c) => isFavorite(two, c))).toEqual([twins[0]]);
  });

  it("two added are two after the playlist is read again, also when a stream id moved", () => {
    const favs = toggle(toggle(new Set(), favKey(group[0] as Channel)), favKey(twins[0] as Channel));
    const again = [ch("0", "MusicBox 80s", "musicbox", "http://p/live/u/p/999.ts"), ...group.slice(1), ...twins];
    const next = migrateFavorites(favs, again) ?? favs;
    expect(again.filter((c) => isFavorite(next, c)).map((c) => c.name)).toEqual(["MusicBox 80s", "Eurodance 90 HD"]);
    expect(next.size).toBe(2);
  });

  it("old keys (by tvg-id, by tvg-id and name) go to one channel each; others stay", () => {
    const next = migrateFavorites(new Set(["musicbox", "music|Eurodance 90 HD", "elsewhere"]), [...group, ...twins]);
    expect(next && Array.from(next).sort()).toEqual([favKey(group[0] as Channel), favKey(twins[0] as Channel), "elsewhere"].sort());
  });
});

describe("favourites of another playlist", () => {
  it("stay where they are, also when a channel here has the same name", () => {
    const mine = { id: "x", name: "Матч", url: "http://other/live/1.ts", group: "" };
    const favs = new Set([favKey(mine)]);
    expect(migrateFavorites(favs, [{ id: "y", name: "Матч", url: "http://p/live/2.ts", group: "" }])).toBeNull();
  });
});
