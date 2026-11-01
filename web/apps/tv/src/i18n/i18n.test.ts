import { describe, expect, it } from "vitest";
import { en } from "./en";
import { ru } from "./ru";
import { setLanguage, t } from "./index";

describe("i18n", () => {
  it("has the same keys in every language", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
  });
  it("fills placeholders", () => {
    setLanguage("ru");
    expect(t("channelsCount", { n: 12 })).toBe("12 каналов");
    setLanguage("en");
    expect(t("channelsCount", { n: 12 })).toBe("12 channels");
  });
  it("falls back to English for an unknown language", () => {
    setLanguage("xx");
    expect(t("navSearch")).toBe("Search");
  });
});

describe("languages", () => {
  it("finds ours for a TV's language tag, as the Android app does", async () => {
    const { resolveLanguage } = await import("./languages");
    expect(resolveLanguage("de-DE")).toBe("de");
    expect(resolveLanguage("pt-BR")).toBe("pt");
    expect(resolveLanguage("pt-PT")).toBe("pt");
    expect(resolveLanguage("zh-CN")).toBe("zh-CN");
    expect(resolveLanguage("zh-Hans-SG")).toBe("zh-CN");
    expect(resolveLanguage("zh-Hant-TW")).toBe("zh-TW");
    expect(resolveLanguage("zh_HK")).toBe("zh-TW");
    expect(resolveLanguage("nn-NO")).toBe("nb");
    expect(resolveLanguage("uz-UZ")).toBe("en");
    expect(resolveLanguage("")).toBe("en");
  });
  it("names every language and has a table for each", async () => {
    const { LANGUAGES } = await import("./languages");
    const { hasLanguage } = await import("./index");
    for (const l of LANGUAGES) expect(hasLanguage(l.code), l.code).toBe(true);
  });
});

describe("loading a language", () => {
  it("fetches a language that is not in the app and shows it", async () => {
    const { loadLanguage, t } = await import("./index");
    const { de } = await import("./de");
    await loadLanguage("de");
    expect(t("navSearch")).toBe(de.navSearch);
    await loadLanguage("en");
    expect(t("navSearch")).toBe("Search");
  });
});
