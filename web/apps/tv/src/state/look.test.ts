import { describe, expect, it } from "vitest";
import { degrees, parseLatLon, statusColor } from "../views/HomeStatus";
import { FOCUS_PRESETS, fontStack, MOTION_FACTOR, scalableFont, scalableSize, scaleTimes } from "./look";
import { DEFAULTS, liveSettingsFor } from "./settings";
import { mayInstallNow, updateEveryMs } from "./updates";

describe("text size (Android fontScale)", () => {
  it("makes a px size scalable and leaves the rest", () => {
    expect(scalableSize("20px")).toBe("calc(20px * var(--fs, 1))");
    expect(scalableSize("18.5px")).toBe("calc(18.5px * var(--fs, 1))");
    expect(scalableSize("1.2em")).toBeNull();
    expect(scalableSize("inherit")).toBeNull();
  });
  it("rewrites only the size inside a font shorthand", () => {
    expect(scalableFont("600 20px var(--st-font)")).toBe("600 calc(20px * var(--fs, 1)) var(--st-font)");
    expect(scalableFont("700 18px/1.4 var(--st-font)")).toBe("700 calc(18px * var(--fs, 1))/1.4 var(--st-font)");
    expect(scalableFont("600 calc(20px * var(--fs, 1)) var(--st-font)")).toBeNull();
    expect(scalableFont("inherit")).toBeNull();
  });
});

describe("animation speed (Android MotionPrefs.Speed)", () => {
  it("uses Android's factors", () => {
    expect(MOTION_FACTOR).toEqual({ fast: 0.6, normal: 1, slow: 1.5 });
  });
  it("scales every time in a list or a shorthand, never a name with digits", () => {
    expect(scaleTimes("300ms", 1.5)).toBe("450ms");
    expect(scaleTimes("0.2s, 100ms", 0.6)).toBe("120ms, 60ms");
    expect(scaleTimes("transform 300ms var(--st-ease), opacity 300ms var(--st-ease)", 0.6)).toBe("transform 180ms var(--st-ease), opacity 180ms var(--st-ease)");
    expect(scaleTimes("spin2s 1s linear infinite", 2)).toBe("spin2s 2000ms linear infinite");
    expect(scaleTimes("home-roll 420ms cubic-bezier(0.2, 0, 0, 1) both", 1)).toBe("home-roll 420ms cubic-bezier(0.2, 0, 0, 1) both");
  });
});

describe("fonts and focus colour", () => {
  it("has a stack for every Android font but the bundled default", () => {
    expect(fontStack("PLUS_JAKARTA_SANS")).toBeNull();
    for (const id of ["LORA", "SYSTEM_SANS", "MONOSPACE", "PLAYFAIR_DISPLAY", "DANCING_SCRIPT", "POPPINS"]) expect(fontStack(id)).toMatch(/(serif|monospace|cursive)$/);
  });
  it("lists the focus presets in Android's order, the default first", () => {
    expect(FOCUS_PRESETS.map((f) => f.hex)).toEqual(["", "#F5B400", "#FFFFFF", "#52DBC8", "#6FB0FF", "#CBBEFF", "#6FDB94", "#FFB95C", "#F2F0ED"]);
  });
});

describe("live delay per playlist", () => {
  it("uses the playlist's own delay, else the general one", () => {
    const s = { ...DEFAULTS, liveLatency: "balanced" as const, buffer: 30, latencyPerPlaylist: { a: "stable", b: "custom" }, liveCustomSec: 12 };
    expect(liveSettingsFor(s, "a")).toMatchObject({ liveLatency: "stable", buffer: 60 });
    expect(liveSettingsFor(s, "b")).toMatchObject({ liveLatency: "custom", buffer: 12 });
    expect(liveSettingsFor(s, "c")).toBe(s);
    expect(liveSettingsFor(s, null)).toBe(s);
    expect(s.buffer).toBe(30); // the general settings are not changed
  });
});

describe("updates (Android UpdatePrefs)", () => {
  it("looks again every 6 hours, a day, or only at start", () => {
    expect(updateEveryMs("6h")).toBe(6 * 3_600_000);
    expect(updateEveryMs("day")).toBe(24 * 3_600_000);
    expect(updateEveryMs("start")).toBe(0);
  });
  it("installs any time, or only from 02:00 to 06:00", () => {
    expect(mayInstallNow("any", new Date(2026, 0, 1, 15))).toBe(true);
    expect(mayInstallNow("night", new Date(2026, 0, 1, 1, 59))).toBe(false);
    expect(mayInstallNow("night", new Date(2026, 0, 1, 2))).toBe(true);
    expect(mayInstallNow("night", new Date(2026, 0, 1, 5, 59))).toBe(true);
    expect(mayInstallNow("night", new Date(2026, 0, 1, 6))).toBe(false);
  });
});

describe("weather settings", () => {
  it("reads a typed place as coordinates only when it is two numbers", () => {
    expect(parseLatLon("41.31, 69.28")).toEqual({ lat: 41.31, lon: 69.28 });
    expect(parseLatLon("-33.9,18.4")).toEqual({ lat: -33.9, lon: 18.4 });
    expect(parseLatLon("Tashkent")).toBeNull();
    expect(parseLatLon("1,2,3")).toBeNull();
    expect(parseLatLon("95, 10")).toBeNull();
  });
  it("counts degrees as Android does (truncated)", () => {
    expect(degrees(9.8, "c")).toBe(9);
    expect(degrees(-0.5, "c")).toBe(0);
    expect(degrees(9.8, "f")).toBe(49);
    expect(degrees(-40, "f")).toBe(-40);
  });
  it("maps the clock colours", () => {
    expect(statusColor("")).toBeUndefined();
    expect(statusColor("accent")).toBe("var(--st-accent)");
    expect(statusColor("muted")).toBe("var(--st-muted)");
    expect(statusColor("#52DBC8")).toBe("#52DBC8");
    expect(statusColor("red")).toBeUndefined();
  });
});
