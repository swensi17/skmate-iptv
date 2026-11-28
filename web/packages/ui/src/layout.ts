import { useEffect, useState } from "preact/hooks";

/**
 * Which interface the app draws: the fixed 1728x972 TV stage ("tv") or one that fills the window ("compact": tablets
 * and phones, touch). Decided at runtime and written on <html> as data-layout / data-orient / data-size / data-input,
 * so CSS can follow it (`:root[data-layout="compact"] ...`) and so can components (`useLayout()`). See docs/responsive.md.
 *
 * The same rules are repeated in a tiny inline script in index.html that only sets the viewport meta before the first
 * paint: keep the two in step.
 */
export type Layout = "tv" | "compact";
export type Orient = "portrait" | "landscape";
/** compact only: a phone (smaller side under 600 CSS px) or a tablet. */
export type Size = "phone" | "tablet";
/** The input used last: a finger, a key (remote, keyboard) or a mouse / Magic Remote pointer. */
export type Input = "touch" | "key" | "mouse";

export interface LayoutEnv {
  ua: string;
  /** The page's query string, e.g. "?layout=compact". */
  search: string;
  width: number;
  height: number;
  /** `(pointer: coarse)`: the main pointing device is a finger. */
  coarse: boolean;
  /** `(pointer: fine)`: a mouse or a trackpad. */
  fine: boolean;
  /** Running inside the Capacitor (Android) shell. */
  capacitor: boolean;
}

export const WIDE_PX = 1280; // a non-touch window at least this wide is the TV layout
export const SMALL_PX = 900; // a screen whose smaller side is under this is compact
export const PHONE_PX = 600; // the smaller side under this is a phone

const TV_UA = /web0s|webos|tizen/i;

/** The pure decision. Order: the URL override, a TV's user agent, the Android shell, a wide mouse screen, then touch / small. */
export function decideLayout(env: LayoutEnv): Layout {
  const q = /[?&]layout=(tv|compact)\b/.exec(env.search);
  if (q) return q[1] as Layout;
  if (TV_UA.test(env.ua)) return "tv";
  if (env.capacitor) return "compact";
  if (env.width >= WIDE_PX && env.fine) return "tv";
  if (env.coarse || Math.min(env.width, env.height) < SMALL_PX) return "compact";
  return "tv";
}

export function orientOf(width: number, height: number): Orient {
  return height > width ? "portrait" : "landscape";
}

export function sizeOf(width: number, height: number): Size {
  return Math.min(width, height) < PHONE_PX ? "phone" : "tablet";
}

/** What to assume before the first touch / key / mouse: a touch device starts as "touch", a TV as "key". */
export function initialInput(layout: Layout, coarse: boolean): Input {
  return coarse ? "touch" : layout === "tv" ? "key" : "mouse";
}

export function readEnv(win: Window = window): LayoutEnv {
  const mq = (q: string) => { try { return !!win.matchMedia && win.matchMedia(q).matches; } catch { return false; } };
  return {
    ua: win.navigator.userAgent,
    search: win.location.search,
    width: win.innerWidth,
    height: win.innerHeight,
    coarse: mq("(pointer: coarse)"),
    fine: mq("(pointer: fine)"),
    capacitor: !!(win as unknown as { Capacitor?: unknown }).Capacitor,
  };
}

export interface LayoutState { layout: Layout; orient: Orient; size: Size; input: Input; compact: boolean }

let state: LayoutState = { layout: "tv", orient: "landscape", size: "tablet", input: "key", compact: false };
const listeners = new Set<(s: LayoutState) => void>();

/** The current layout (before `installLayout` runs: a TV). */
export function getLayout(): LayoutState { return state; }
export function isCompact(): boolean { return state.compact; }

function set(next: Partial<LayoutState>, doc: Document, force = false): void {
  const merged = { ...state, ...next };
  merged.compact = merged.layout === "compact";
  if (!force && merged.layout === state.layout && merged.orient === state.orient && merged.size === state.size && merged.input === state.input) return;
  state = merged;
  const root = doc.documentElement;
  root.setAttribute("data-layout", state.layout);
  root.setAttribute("data-orient", state.orient);
  root.setAttribute("data-size", state.size);
  root.setAttribute("data-input", state.input);
  listeners.forEach((f) => f(state));
}

/** In compact mode the page is as wide as the device (a TV keeps the 1920 px of index.html). */
function applyViewport(doc: Document, layout: Layout): void {
  if (layout !== "compact") return;
  const meta = doc.querySelector('meta[name="viewport"]');
  if (meta && !/device-width/.test(meta.getAttribute("content") || "")) meta.setAttribute("content", "width=device-width, initial-scale=1, viewport-fit=cover");
}

/**
 * Decides the layout now and keeps the attributes on <html> up to date (resize, rotation, last input used).
 * Returns the function that stops it. Call once, before `fitStage`.
 */
export function installLayout(win: Window = window, doc: Document = win.document): () => void {
  const first = readEnv(win);
  const layout = decideLayout(first);
  set({ layout, orient: orientOf(first.width, first.height), size: sizeOf(first.width, first.height), input: initialInput(layout, first.coarse) }, doc, true);
  applyViewport(doc, layout);

  const update = () => {
    const env = readEnv(win);
    const l = decideLayout(env);
    set({ layout: l, orient: orientOf(env.width, env.height), size: sizeOf(env.width, env.height) }, doc);
    applyViewport(doc, l);
  };
  let lastTouch = 0;
  const onTouch = () => { lastTouch = Date.now(); set({ input: "touch" }, doc); };
  // A tap makes the browser send mouse events a moment later: they are not a mouse.
  const onMouse = (e: MouseEvent) => {
    if (Date.now() - lastTouch < 800) return;
    if (e.type === "mousemove" && e.movementX === 0 && e.movementY === 0) return;
    set({ input: "mouse" }, doc);
  };
  const onKey = () => set({ input: "key" }, doc);

  win.addEventListener("resize", update);
  win.addEventListener("orientationchange", update);
  doc.addEventListener("touchstart", onTouch, { capture: true, passive: true });
  doc.addEventListener("mousedown", onMouse, true);
  doc.addEventListener("mousemove", onMouse, { capture: true, passive: true });
  doc.addEventListener("keydown", onKey, true);
  return () => {
    win.removeEventListener("resize", update);
    win.removeEventListener("orientationchange", update);
    doc.removeEventListener("touchstart", onTouch, true);
    doc.removeEventListener("mousedown", onMouse, true);
    doc.removeEventListener("mousemove", onMouse, true);
    doc.removeEventListener("keydown", onKey, true);
  };
}

/** Preact hook: the current layout; the component is drawn again when it changes. */
export function useLayout(): LayoutState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state); // it may have changed between the first draw and this effect
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}
