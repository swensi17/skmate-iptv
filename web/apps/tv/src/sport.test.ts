import { describe, expect, it } from "vitest";
import type { Channel } from "@skmate/core";
import { isSport, kindOf, sportSummary } from "./sport";

const ch = (name: string, group = ""): Channel => ({ id: name, name, url: "u", group });

describe("sport channels", () => {
  it("recognises a channel by its group or its name", () => {
    expect(isSport(ch("Первый канал", "спорт"))).toBe(true);
    expect(isSport(ch("Eurosport 1 HD"))).toBe(true);
    expect(isSport(ch("Матч! Футбол 1"))).toBe(true);
    expect(isSport(ch("Кино ТВ", "кино"))).toBe(false);
  });
  it("sorts them by kind of sport", () => {
    expect(kindOf(ch("Матч! Футбол 1"))).toBe("football");
    expect(kindOf(ch("КХЛ ТВ"))).toBe("hockey");
    expect(kindOf(ch("UFC Fight Pass"))).toBe("fight");
    expect(kindOf(ch("Eurosport 1 HD"))).toBe("other");
  });
  it("counts only the kinds that have channels", () => {
    const s = sportSummary([ch("Матч! Футбол 1"), ch("Футбол 2"), ch("КХЛ ТВ"), ch("Кино ТВ")]);
    expect(s.list).toHaveLength(3);
    expect(s.kinds).toEqual([["football", 2], ["hockey", 1]]);
  });
});
