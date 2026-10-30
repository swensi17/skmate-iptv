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
