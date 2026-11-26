import { afterEach, describe, expect, it, vi } from "vitest";
import { detectPlatform, exitApp, remoteKey } from "./index";

describe("detectPlatform", () => {
  it("recognises webOS and Tizen", () => {
    expect(detectPlatform("Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/79")).toBe("webos");
    expect(detectPlatform("Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) Chrome/85")).toBe("tizen");
    expect(detectPlatform("Mozilla/5.0 (Macintosh) Chrome/120")).toBe("browser");
  });
});

describe("remoteKey", () => {
  const key = (keyCode: number, k = "") => remoteKey({ key: k, keyCode, shiftKey: false } as KeyboardEvent);
  it("reads a TV remote by its keyCode", () => {
    expect(key(427)).toBe("chUp"); // Tizen CH+
    expect(key(34)).toBe("chDown"); // webOS CH−
    expect(key(10252)).toBe("playPause");
    expect(key(10190)).toBe("lastChannel");
    expect(key(457)).toBe("info");
    expect(key(55)).toEqual({ digit: 7 });
    expect(key(13)).toBe("ok");
  });
  it("reads a keyboard by its key name", () => {
    expect(key(0, "ArrowLeft")).toBe("left");
    expect(key(0, "3")).toEqual({ digit: 3 });
    expect(key(0, "PageUp")).toBe("chUp");
    expect(key(0, "x")).toBeNull();
  });
});

describe("exitApp (Back on the entry screen must leave the app: LG and Samsung store rules)", () => {
  // The tests run in Node: a stand-in window object is enough for exitApp.
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.window) g.window = Object.assign(globalThis, { close: () => undefined });
  const w = g.window as Record<string, unknown>;
  afterEach(() => { delete w.tizen; delete w.webOS; delete w.PalmSystem; });
  it("closes the application on Tizen", () => {
    const exit = vi.fn();
    w.tizen = { application: { getCurrentApplication: () => ({ exit }) } };
    expect(exitApp("tizen")).toBe(true);
    expect(exit).toHaveBeenCalledOnce();
  });
  it("calls webOS.platformBack, else PalmSystem.platformBack, on webOS", () => {
    const back = vi.fn();
    w.webOS = { platformBack: back };
    expect(exitApp("webos")).toBe(true);
    expect(back).toHaveBeenCalledOnce();
    delete w.webOS;
    const palm = vi.fn();
    w.PalmSystem = { platformBack: palm };
    expect(exitApp("webos")).toBe(true);
    expect(palm).toHaveBeenCalledOnce();
  });
  it("leaves a desktop browser page alone", () => {
    expect(exitApp("browser")).toBe(false);
  });
});
