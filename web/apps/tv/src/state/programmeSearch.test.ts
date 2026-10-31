import { describe, expect, it } from "vitest";
import type { Channel } from "@skmate/core";
import { GuideData } from "@skmate/epg";
import { ProgrammeSearch } from "./programmeSearch";

const ch = (id: string, name: string): Channel => ({ id, name, url: `u${id}`, group: "" });
const now = Date.UTC(2026, 9, 31, 10, 0);
const H = 3_600_000;

const data = new GuideData(
  new Map([["1", "a"], ["2", "a"], ["3", "b"]]),
  new Map([
    ["a", [
      { start: now - H, stop: now, title: "Старая передача" },
      { start: now - 1800_000, stop: now + 1800_000, title: "Новости дня" },
      { start: now + 1800_000, stop: now + 2 * H, title: "Футбол. Чемпионат" },
    ]],
    ["b", [{ start: now + H, stop: now + 2 * H, title: "Футбол. Обзор" }]],
  ]),
  now,
);
const channels = [ch("1", "Первый HD"), ch("2", "Первый SD"), ch("3", "Матч")];

describe("ProgrammeSearch", () => {
  const s = new ProgrammeSearch(data, channels, now);
  it("finds programmes by title and skips what is over", () => {
    expect(s.search("старая", now)).toEqual([]);
    expect(s.search("новости", now).map((h) => h.programme.title)).toEqual(["Новости дня"]);
  });
  it("finds in a wrong layout and with a typo", () => {
    expect(s.search("yjdjcnb", now).map((h) => h.programme.title)).toEqual(["Новости дня"]);
    expect(s.search("футбол", now).length).toBe(2);
    expect(s.search("футбоол", now).length).toBeGreaterThan(0);
  });
  it("reports a shared guide channel once, under the first channel", () => {
    expect(s.search("новости", now)[0]?.channel.id).toBe("1");
  });
  it("marks what is on now and orders the soonest first", () => {
    const hits = s.search("футбол", now);
    expect(hits[0]?.live).toBe(false);
    expect(hits.map((h) => h.programme.start)).toEqual([...hits.map((h) => h.programme.start)].sort((a, b) => a - b));
  });
});
