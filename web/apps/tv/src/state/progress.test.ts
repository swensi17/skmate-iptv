import { describe, expect, it } from "vitest";
import { parseM3U } from "@skmate/core";
import { migrateProgressIds } from "./progress";

const m3u = ["#EXTM3U",
  '#EXTINF:-1 tvg-type="movie" group-title="Кино",Фильм А', "http://p/movie/a.mp4",
  '#EXTINF:-1 tvg-type="movie" group-title="Кино",Фильм Б', "http://p/movie/b.mp4",
  '#EXTINF:-1 tvg-type="series" group-title="Сериалы",Шоу S01E02', "http://p/series/2.mp4",
].join("\n");

describe("progress kept by the old ids moves to the lasting ones (2.6.9)", () => {
  const list = parseM3U(m3u);
  const movieB = { positionMs: 5000, durationMs: 90000, at: 1, kind: "movie" as const, itemId: "1", name: "Фильм Б", item: { id: "1", name: "Фильм Б", category: "Кино", url: "http://p/movie/b.mp4" } };
  const ep = { positionMs: 5000, durationMs: 90000, at: 2, kind: "series" as const, itemId: "Шоу", name: "Шоу", item: { id: "Шоу", name: "Шоу", category: "Сериалы" }, episodeId: "2" };
  const book = { "pl1|movie|1": movieB, "pl1|series|2": ep, "xt|movie|12345": { ...movieB, itemId: "12345" } };

  it("an M3U playlist's places become the ids of the same entries; Xtream is left alone", () => {
    const out = migrateProgressIds(book, [{ id: "pl1", m3u: true }, { id: "xt", m3u: false }], (pid) => (pid === "pl1" ? list : null));
    expect(out).not.toBeNull();
    const b = list[1]?.id as string;
    expect(out?.[`pl1|movie|${b}`]?.itemId).toBe(b);
    expect(out?.[`pl1|movie|${b}`]?.item.id).toBe(b);
    expect(out?.[`pl1|series|${list[2]?.id}`]?.episodeId).toBe(list[2]?.id);
    expect(out?.["xt|movie|12345"]?.itemId).toBe("12345");
    expect(Object.keys(out ?? {})).toHaveLength(3);
  });

  it("does nothing a second time, nor without a kept copy", () => {
    const once = migrateProgressIds(book, [{ id: "pl1", m3u: true }], () => list) ?? book;
    expect(migrateProgressIds(once, [{ id: "pl1", m3u: true }], () => list)).toBeNull();
    expect(migrateProgressIds(book, [{ id: "pl1", m3u: true }], () => null)).toBeNull();
  });
});
