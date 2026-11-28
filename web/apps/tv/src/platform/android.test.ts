import { afterEach, describe, expect, it, vi } from "vitest";
import { capacitorApp } from "./android";
import { exitApp } from "./index";

afterEach(() => vi.unstubAllGlobals());

describe("the Android shell", () => {
  it("is not there outside Capacitor", () => {
    vi.stubGlobal("window", {});
    expect(capacitorApp()).toBeNull();
  });
  it("exitApp calls App.exitApp of the shell", () => {
    const exit = vi.fn();
    vi.stubGlobal("window", { Capacitor: { Plugins: { App: { exitApp: exit, addListener: vi.fn() } } } });
    expect(exitApp("browser")).toBe(true);
    expect(exit).toHaveBeenCalledOnce();
  });
});
