import { describe, expect, it, vi } from "vitest";
import { decideLayout, initialInput, orientOf, sizeOf, type LayoutEnv } from "./layout";
import { fitStage } from "./stage";

const env = (o: Partial<LayoutEnv> = {}): LayoutEnv => ({ ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/120", search: "", width: 1920, height: 1080, coarse: false, fine: true, capacitor: false, ...o });

describe("decideLayout", () => {
  it("a TV user agent is always the TV layout, whatever the size", () => {
    expect(decideLayout(env({ ua: "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) Chrome/63", width: 800, height: 600, fine: false }))).toBe("tv");
    expect(decideLayout(env({ ua: "Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/79", coarse: true }))).toBe("tv");
  });
  it("a wide window with a mouse is the TV layout (the desktop app)", () => {
    expect(decideLayout(env())).toBe("tv");
    expect(decideLayout(env({ width: 1280, height: 720 }))).toBe("tv");
  });
  it("the Android shell, a touch screen or a small window is compact", () => {
    expect(decideLayout(env({ capacitor: true, width: 1920, height: 1080 }))).toBe("compact");
    expect(decideLayout(env({ width: 960, height: 600, coarse: true, fine: false }))).toBe("compact");
    expect(decideLayout(env({ width: 1280, height: 800, coarse: true, fine: false }))).toBe("compact"); // a wide tablet
    expect(decideLayout(env({ width: 1000, height: 700 }))).toBe("compact");
    expect(decideLayout(env({ width: 412, height: 915, coarse: true, fine: false }))).toBe("compact");
  });
  it("a window with no pointer information and a big side is the TV layout", () => {
    expect(decideLayout(env({ width: 1100, height: 950, fine: false }))).toBe("tv");
  });
  it("?layout= decides over everything", () => {
    expect(decideLayout(env({ search: "?layout=compact" }))).toBe("compact");
    expect(decideLayout(env({ search: "?a=1&layout=tv", capacitor: true, width: 400, height: 800 }))).toBe("tv");
    expect(decideLayout(env({ search: "?layout=other", width: 400, height: 800, coarse: true, fine: false }))).toBe("compact");
  });
});

describe("orientOf, sizeOf, initialInput", () => {
  it("tells portrait from landscape and a phone from a tablet", () => {
    expect(orientOf(800, 1280)).toBe("portrait");
    expect(orientOf(960, 600)).toBe("landscape");
    expect(orientOf(500, 500)).toBe("landscape");
    expect(sizeOf(412, 915)).toBe("phone");
    expect(sizeOf(915, 412)).toBe("phone");
    expect(sizeOf(960, 600)).toBe("tablet");
  });
  it("starts as touch on a touch screen, key on a TV, mouse otherwise", () => {
    expect(initialInput("compact", true)).toBe("touch");
    expect(initialInput("tv", false)).toBe("key");
    expect(initialInput("compact", false)).toBe("mouse");
  });
});

describe("fitStage in the compact layout", () => {
  const fake = (layout: string) => {
    const props: Record<string, string> = { "--stage-scale": "1.1" };
    const root = { getAttribute: (n: string) => (n === "data-layout" ? layout : null), style: { setProperty: (k: string, v: string) => { props[k] = v; }, removeProperty: (k: string) => { delete props[k]; } } } as unknown as HTMLElement;
    const win = { innerWidth: 960, innerHeight: 600, addEventListener() {}, removeEventListener() {}, document: { activeElement: null, addEventListener() {}, removeEventListener() {} } } as unknown as Window;
    return { props, run: () => fitStage(root, win) };
  };
  it("sets nothing and clears the stage variables", () => {
    const c = fake("compact");
    c.run();
    expect(c.props).toEqual({});
  });
  it("still fits the stage on the TV", () => {
    vi.stubGlobal("HTMLInputElement", class {});
    vi.stubGlobal("HTMLTextAreaElement", class {});
    const t = fake("tv");
    t.run();
    expect(Number(t.props["--stage-scale"])).toBeCloseTo(960 / 1728, 5);
  });
});
