import { describe, expect, it } from "vitest";
import { bestMatch, keyFor, parseProgrammeTitle, parseResults, spend } from "./tmdb";

describe("parseProgrammeTitle (ProgrammeTitleTest.kt)", () => {
  it("film and series marks give the kind and leave the bare title", () => {
    expect(parseProgrammeTitle("Х/ф «Брат 2» (16+)")).toEqual({ title: "Брат 2", kind: "movie" });
    expect(parseProgrammeTitle("Т/с \"Великолепная пятёрка\". 12-я серия")).toEqual({ title: "Великолепная пятёрка", kind: "tv" });
  });
  it("brackets, episodes and age marks are dropped", () => {
    expect(parseProgrammeTitle("Наш спецназ (Животная жестокость)")).toEqual({ title: "Наш спецназ", kind: null });
    expect(parseProgrammeTitle("Чингачгук - Большой Змей [12+]")).toEqual({ title: "Чингачгук - Большой Змей", kind: null });
    expect(parseProgrammeTitle("След Сокола, 3 серия")).toEqual({ title: "След Сокола", kind: null });
  });
  it("news, sport and talk shows are never looked up", () => {
    for (const t of ["Новости", "Вести. Местное время", "60 минут", "Футбол. Лига чемпионов", "Д/ф «Тайны века»"]) expect(parseProgrammeTitle(t)).toBeNull();
  });
});

describe("matching", () => {
  const body = { results: [
    { id: 1, title: "Брат 2", original_title: "Brat 2", release_date: "2000-05-11", overview: "Данила едет в Америку.", poster_path: "/b2.jpg", popularity: 9 },
    { id: 2, title: "Брат", release_date: "1997-05-17", poster_path: "/b1.jpg", popularity: 20 },
    { id: 3, title: "Брат 2", adult: true, poster_path: "/x.jpg" },
  ] };
  it("takes the close one with a poster, never an adult one", () => {
    const art = bestMatch({ title: "Брат 2", kind: "movie" }, [parseResults("movie", body)]);
    expect(art).toEqual({ posterUrl: "https://image.tmdb.org/t/p/w185/b2.jpg", title: "Брат 2", year: 2000, overview: "Данила едет в Америку.", type: "movie" });
  });
  it("without a film or series mark the title has to match all but exactly", () => {
    expect(bestMatch({ title: "Брат 2 возвращение", kind: null }, [parseResults("movie", body)])).toBeNull();
  });
});

describe("the key and the allowance", () => {
  it("the viewer's own key first, else SkMate's (metered), else none", () => {
    expect(keyFor({ tmdbKey: " abc " }, "built")).toEqual({ key: "abc", metered: false });
    expect(keyFor({ tmdbKey: "" }, "built")).toEqual({ key: "built", metered: true });
    expect(keyFor({ tmdbKey: "" }, "")).toBeNull();
  });
  it("stops at 40 a minute", () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
    let n = 0;
    while (spend(store, 1_000) && n < 100) n++;
    expect(n).toBe(40);
    expect(spend(store, 61_000)).toBe(true); // the next minute
  });
});
