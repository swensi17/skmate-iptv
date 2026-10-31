import { describe, expect, it } from "vitest";
import { MAX_HOPS, mirrorKey, pickMirrors, quality } from "./mirrors";
import type { Channel } from "./m3u/parse";

const ch = (id: string, name: string, url = `http://s/${id}`): Channel => ({ id, name, url, group: "" });

describe("mirrors (as the Android ChannelMirrors)", () => {
  it("drops quality marks and filler from the key", () => {
    expect(mirrorKey("Первый канал HD")).toBe("первый");
    expect(mirrorKey("Первый SD [backup]")).toBe("первый");
    expect(mirrorKey("Россия 1 +2")).not.toBe(mirrorKey("Россия 1"));
  });
  it("rates quality", () => {
    expect(quality("Матч 4K")).toBe(4);
    expect(quality("Матч HD")).toBe(2);
    expect(quality("Матч")).toBe(1);
    expect(quality("Матч SD")).toBe(0);
  });
  const all = [ch("1", "Первый HD"), ch("2", "Первый канал SD"), ch("3", "Первый 4K"), ch("4", "Россия 1"), ch("5", "Первый HD", "http://s/1")];
  it("finds the other copies, the nearest quality first", () => {
    expect(pickMirrors(all[0] as Channel, all).map((c) => c.id)).toEqual(["3", "2"]);
  });
  it("skips copies already tried, other channels and the same stream", () => {
    expect(pickMirrors(all[0] as Channel, all, new Set(["3"])).map((c) => c.id)).toEqual(["2"]);
    expect(pickMirrors(all[3] as Channel, all)).toEqual([]);
  });
  it("is bounded", () => {
    const many = Array.from({ length: 10 }, (_, i) => ch(String(i), "Канал HD"));
    expect(pickMirrors(many[0] as Channel, many).length).toBeLessThanOrEqual(MAX_HOPS);
  });
});
