import { describe, expect, it } from "vitest";
import { en } from "../i18n/en";
import { ru } from "../i18n/ru";
import { highlight, isWholeKey, parseAnswer, plainFirstLine } from "./helpAnswer";

// The answers as Android 2.5.7 reads them (HelpPage.kt HelpAnswer).
describe("help answers", () => {
  const roots = new Set([ru.sa_settings_title, ru.sa_content_key_channels]);

  it("draws the path the answer starts with, quotes and all, and does not write that line again", () => {
    const a = parseAnswer(ru.sa_help_a1, roots);
    expect(a.path).toEqual(["Настройки", "Источники каналов", "Плейлисты", "Добавить источник"]);
    expect(a.lines[0]?.kind).toBe("path");
    expect(a.lines.filter((l) => l.kind === "step").map((l) => l.mark)).toEqual(["1", "2", "3"]);
  });

  it("keeps a comma inside «quotes» in the item", () => {
    const a = parseAnswer("Настройки › Источники каналов › «Отключить, не удаляя».\n\n1. Готово.", roots);
    expect(a.path[a.path.length - 1]).toBe("Отключить, не удаляя");
    expect(parseAnswer(ru.sa_help_a12, roots).path).toEqual(["Настройки", "Источники каналов", "Плейлисты"]);
  });

  it("lights the keys of an answer without a path, and points", () => {
    const a = parseAnswer(ru.sa_help_a2, roots);
    expect(a.path).toEqual([]);
    // 2.7.0 answer: ▲ ▼, OK, then "◀ ▶ выбирают кнопку перемотки".
    expect(a.keys).toEqual(["◀", "▶", "▲", "▼", "OK"]);
    // Points and the conclusion end up as one closing paragraph (2.5.7).
    expect(a.lines.filter((l) => l.kind === "done").length).toBe(1);
    expect(a.lines.some((l) => l.kind === "point" || l.kind === "heading")).toBe(false);
  });

  it("reads OK only as a word of its own", () => {
    expect(isWholeKey("OKKO", 0, "OK")).toBe(false);
    expect(isWholeKey("press OK.", 6, "OK")).toBe(true);
  });

  it("hints with the first line, without its mark", () => {
    expect(plainFirstLine("1. Update the app.\n2. More")).toBe("Update the app.");
    expect(plainFirstLine(en.sa_help_a19)).toBe("In the player press OK.");
  });

  it("picks out keys and menu items", () => {
    expect(highlight("Press OK › «Audio»")).toEqual([
      { kind: "plain", text: "Press " }, { kind: "key", text: "OK" }, { kind: "plain", text: " › " }, { kind: "item", text: "«Audio»" },
    ]);
  });
});
