import { describe, expect, it } from "vitest";
import type { Channel } from "@skmate/core";
import { favKey, isFavorite, migrateFavorites, toggle } from "./favorites";

const ch = (id: string, name: string, tvgId?: string): Channel => ({ id, name, url: `http://p/${id}`, group: "", ...(tvgId ? { tvgId } : {}) });

describe("favourites (2.6.2)", () => {
  const hd = ch("1", "Первый HD", "perviy");
  const sd = ch("2", "Первый", "perviy");
  const plus = ch("3", "Первый +2", "perviy");

  it("one heart lights one channel, not every copy with the same tvg-id", () => {
    const favs = toggle(new Set(), favKey(sd));
    expect([hd, sd, plus].filter((c) => isFavorite(favs, c))).toEqual([sd]);
  });

  it("adding two channels makes two favourites, again after the playlist is read again", () => {
    let favs = toggle(toggle(new Set(), favKey(hd)), favKey(ch("9", "Матч", "match")));
    const again = [ch("10", "Первый HD", "perviy"), sd, plus, ch("11", "Матч", "match")];
    expect(migrateFavorites(favs, again)).toBeNull();
    favs = new Set(favs);
    expect(again.filter((c) => isFavorite(favs, c))).toHaveLength(2);
  });

  it("an old key by tvg-id alone goes to the first channel with it; others stay", () => {
    const next = migrateFavorites(new Set(["perviy", "elsewhere"]), [hd, sd, plus]);
    expect(next && Array.from(next).sort()).toEqual([favKey(hd), "elsewhere"].sort());
  });
});
