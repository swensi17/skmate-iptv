import { describe, expect, it } from "vitest";
import type { Channel } from "@skmate/core";
import { isMovieChannel, isMovieTitle } from "./kinds";

const ch = (name: string, group = ""): Channel => ({ id: name, name, url: "u", group });

describe("films", () => {
  it("recognises a film channel by group or name", () => {
    expect(isMovieChannel(ch("Первый канал", "кино"))).toBe(true);
    expect(isMovieChannel(ch("Кино ТВ"))).toBe(true);
    expect(isMovieChannel(ch("Discovery Channel", "познавательные"))).toBe(false);
  });
  it("recognises a film or series in a guide title", () => {
    expect(isMovieTitle("Х/ф «Брат»")).toBe(true);
    expect(isMovieTitle("Т/с Следствие вели")).toBe(true);
    expect(isMovieTitle("Новости дня")).toBe(false);
  });
});
