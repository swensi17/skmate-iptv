import { describe, expect, it } from "vitest";
import { ratingTone, splitRatings } from "./ProgrammeArt";

describe("ratings out of a description", () => {
  it("reads the four ways the guides write them", () => {
    expect(splitRatings("Фильм о путешествиях. Кинопоиск: [5.7/10]").ratings).toEqual([{ name: "Кинопоиск", value: 5.7 }]);
    expect(splitRatings("Драма. КиноПоиск [7.9] (16+) В ролях: Мак").ratings).toEqual([{ name: "Кинопоиск", value: 7.9 }]);
    expect(splitRatings("Ситком. IMDb: 6.2, Прод.: 23 минуты").ratings).toEqual([{ name: "IMDb", value: 6.2 }]);
    expect(splitRatings("Комедия. IMDb [7.2]").ratings).toEqual([{ name: "IMDb", value: 7.2 }]);
  });
  it("takes them out of the text without leaving brackets or slashes", () => {
    const r = splitRatings("Длительность: 1ч. 50 мин., 2005. Кинопоиск: [5.7/10]");
    expect(r.rest).toBe("Длительность: 1ч. 50 мин., 2005.");
    expect(r.rest).not.toMatch(/[[\]/]/);
    expect(splitRatings("Без оценок").ratings).toEqual([]);
  });
  it("colours them as the sites do", () => {
    expect([ratingTone(8), ratingTone(5.7), ratingTone(4.1)]).toEqual(["good", "mid", "bad"]);
  });
});
