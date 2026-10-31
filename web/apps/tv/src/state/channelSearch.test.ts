import { describe, expect, it } from "vitest";
import type { Channel } from "@skmate/core";
import { GuideData } from "@skmate/epg";
import { ChannelSearch } from "./channelSearch";

const ch = (id: string, name: string): Channel => ({ id, name, url: `u${id}`, group: "" });
const now = Date.UTC(2026, 9, 31, 10, 0);
const data = new GuideData(new Map([["2", "x"]]), new Map([["x", [{ start: now - 1000, stop: now + 1000, title: "Футбол. Лига чемпионов" }]]]), now);
const channels = [ch("1", "Футбол 1"), ch("2", "Первый"), ch("3", "Кино")];

describe("ChannelSearch", () => {
  const s = new ChannelSearch(channels, data, now);
  it("puts name matches before channels that merely show it now", () => {
    expect(s.search("футбол").map((c) => c.id)).toEqual(["1", "2"]);
  });
  it("lists a channel once and finds nothing for nonsense", () => {
    expect(s.search("кино").map((c) => c.id)).toEqual(["3"]);
    expect(s.search("ъъъъъ")).toEqual([]);
  });
});
