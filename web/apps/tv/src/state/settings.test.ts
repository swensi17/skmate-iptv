import { describe, expect, it } from "vitest";
import { resolveTheme, systemDark } from "./settings";

describe("resolveTheme", () => {
  it("follows the system by default", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
  it("an explicit choice wins", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("settings (Android)", async () => {
  const { accentColor, bufferFor, clampZoom, DEFAULTS } = await import("./settings");
  it("UI zoom is 50-150 in steps of 5", () => {
    expect(clampZoom(100)).toBe(100);
    expect(clampZoom(42)).toBe(50);
    expect(clampZoom(151)).toBe(150);
    expect(clampZoom(83)).toBe(85);
  });
  it("the live delay presets set the buffer", () => {
    expect(bufferFor("low", 8)).toBe(10);
    expect(bufferFor("balanced", 8)).toBe(30);
    expect(bufferFor("stable", 8)).toBe(60);
    expect(bufferFor("custom", 75)).toBe(60);
    expect(bufferFor("custom", 4)).toBe(4);
  });
  it("INK keeps the theme's own accent; a hex wins over a preset", () => {
    expect(accentColor({ accent: "ink", accentHex: "" }, true)).toBeNull();
    expect(accentColor({ accent: "teal", accentHex: "" }, true)).toBe("#52DBC8");
    expect(accentColor({ accent: "teal", accentHex: "" }, false)).toBe("#006B5E");
    expect(accentColor({ accent: "teal", accentHex: "#4e952a" }, true)).toBe("#4E952A");
  });
  it("Quick starts with Android's six rows", () => {
    expect(DEFAULTS.quickPinned).toEqual(["quick_live_preview", "quick_preview_sound", "quick_channel_numbers", "quick_hdr", "quick_autoplay", "quick_check_update"]);
  });
});

describe("the system's look on old TVs", () => {
  const mm = (dark: boolean | null, light: boolean | null) => (q: string) => {
    const known = q.includes("dark") ? dark : light;
    return known === null ? { matches: false, media: "not all" } : { matches: known, media: q };
  };
  it("is dark when the TV does not know prefers-color-scheme (webOS 4–6)", () => {
    expect(systemDark(mm(null, null))).toBe(true);
    expect(systemDark(undefined)).toBe(true);
  });
  it("follows the system where it answers", () => {
    expect(systemDark(mm(true, false))).toBe(true);
    expect(systemDark(mm(false, true))).toBe(false);
  });
});
