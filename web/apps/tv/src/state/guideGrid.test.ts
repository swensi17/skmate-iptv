import { describe, expect, it } from "vitest";
import type { Channel } from "@skmate/core";
import { GuideData, type Programme } from "@skmate/epg";
import { cellsIn, cursorStep, followCursor, guideWindow, programmeAt, pxAt, stepScroll } from "./guideGrid";
import { applyBoard, countryOfName, sportOf, sportOnChannels } from "./guideSport";

const M = 60_000;
const T0 = Date.UTC(2026, 10, 25, 12, 0);
const prog = (startMin: number, stopMin: number, title = `p${startMin}`): Programme => ({ start: T0 + startMin * M, stop: T0 + stopMin * M, title });

describe("guide grid", () => {
  const list = [prog(0, 30), prog(30, 90), prog(180, 210)];
  const ws = T0 - 120 * M;
  const we = T0 + 600 * M;

  it("finds the programme on at a time", () => {
    expect(programmeAt(list, T0 + 45 * M)?.title).toBe("p30");
    expect(programmeAt(list, T0 + 100 * M)).toBeNull();
  });

  it("steps programme by programme, and half an hour at a time across a long gap (EpgScreen.cursorStep)", () => {
    expect(cursorStep(list, T0 + 10 * M, +1, ws, we)).toBe(T0 + 30 * M);
    // From the last programme before a 90 min gap: its end, then +30 min steps, then the next programme.
    expect(cursorStep(list, T0 + 45 * M, +1, ws, we)).toBe(T0 + 90 * M);
    expect(cursorStep(list, T0 + 90 * M, +1, ws, we)).toBe(T0 + 120 * M);
    expect(cursorStep(list, T0 + 150 * M, +1, ws, we)).toBe(T0 + 180 * M);
    expect(cursorStep(list, T0 + 45 * M, -1, ws, we)).toBe(T0);
    expect(cursorStep(list, T0 + 190 * M, -1, ws, we)).toBe(T0 + 150 * M);
    expect(cursorStep(list, ws + M, -1, ws, we)).toBe(ws);
  });

  it("opens two hours back from the half hour", () => {
    const w = guideWindow(T0 + 17 * M, T0 + 300 * M);
    expect(w.start).toBe(T0 - 120 * M);
    expect(w.end).toBe(T0 + 300 * M);
    expect(pxAt(T0, w.start)).toBeCloseTo(120 * 7.2);
  });

  it("reaches as far as the stored guide does: a week kept, a week of timeline", () => {
    const week = T0 + 7 * 24 * 60 * M;
    const w = guideWindow(T0 + 17 * M, week);
    expect(w.end).toBe(week);
    // a week at 7.2 px a minute is 72 576 px: a long plane, but only the cells in view are ever built
    expect(pxAt(w.end, w.start)).toBeCloseTo((7 * 24 * 60 + 120) * 7.2);
  });

  it("scrolls only when the cursor comes within a slot of an edge", () => {
    expect(followCursor(500, 0, 1360, 5000)).toBe(0);
    expect(followCursor(1300, 0, 1360, 5000)).toBe(1300 - 1360 + 216);
    expect(followCursor(100, 400, 1360, 5000)).toBe(0);
  });

  it("keeps one row of room above and below the focused row", () => {
    expect(stepScroll(0, 0, 490, 3000)).toBe(0);
    expect(stepScroll(6, 0, 490, 3000)).toBe(6 * 62 + 56 + 62 - 490);
    expect(stepScroll(3, 200, 490, 3000)).toBe(3 * 62 - 62);
  });

  it("draws overlapping programmes from where the one before ends", () => {
    const overlap = [prog(0, 60, "a"), prog(30, 90, "b")];
    const cells = cellsIn(overlap, ws, we, 0, 10_000);
    expect(cells.map((c) => c.p.title)).toEqual(["a", "b"]);
    const [a, b] = cells;
    expect(b!.x).toBeCloseTo(a!.x + a!.w + 6);
  });
});

describe("sport on channels", () => {
  it("names the sport of a guide title, in Russian too", () => {
    expect(sportOf("Футбол. Кубок России. Акрон – ЦСКА")).toBe("FOOTBALL");
    expect(sportOf("Хоккей. ВХЛ. Буран – Химик")).toBe("ICE_HOCKEY");
    expect(sportOf("Formula 1: Grand Prix of Brazil")).toBe("MOTORSPORT");
    expect(sportOf("American Football: NFL")).toBe("AMERICAN_FOOTBALL");
    expect(sportOf("Grand Designs")).toBeNull();
    expect(sportOf("WTA Finals: E. Svitolina (UKR) – M. Andreeva")).toBe("TENNIS");
  });

  it("finds the countries channel names point to", () => {
    expect(countryOfName("Cosmote Sport 2 HD GR")).toBe("GR");
    expect(countryOfName("Sky Sports News HD 50 UK")).toBe("GB");
    expect(countryOfName("Матч! Футбол 2")).toBe("RU");
    expect(countryOfName("Eurosport HD")).toBeNull();
  });

  it("lists sport on now, a fixture only on a sports channel, one card for one programme on two channels", () => {
    const now = T0 + 10 * M;
    const ch = (id: string, name: string): Channel => ({ id, name, url: `http://x/${id}`, group: "" });
    const channels = [ch("1", "Матч! Футбол 1"), ch("2", "Матч! Футбол 1 HD"), ch("3", "Drama TV"), ch("4", "Eurosport 1")];
    const data = new GuideData(
      new Map([["1", "m"], ["2", "m"], ["3", "d"], ["4", "e"]]),
      new Map([
        ["m", [prog(0, 120, "Футбол. РПЛ. Спартак – Зенит")]],
        ["d", [prog(0, 60, "Liebe – Lügen")]],
        ["e", [prog(-30, 30, "Kiel – Magdeburg"), prog(60, 120, "Snooker: UK Championship")]],
      ]),
    );
    const items = sportOnChannels(channels, data, now);
    expect(items.map((i) => [i.sport, i.title, i.channels.length])).toEqual([
      ["FOOTBALL", "Футбол. РПЛ. Спартак – Зенит", 2],
      ["OTHER", "Kiel – Magdeburg", 1],
    ]);
    expect(applyBoard(items, "зенит", new Set(), new Set(), "RELEVANCE").length).toBe(1);
    expect(applyBoard(items, "", new Set(["OTHER"]), new Set(), "TIME").map((i) => i.title)).toEqual(["Kiel – Magdeburg"]);
  });
});
