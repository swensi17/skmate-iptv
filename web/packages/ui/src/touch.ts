/**
 * Touch helpers shared by every screen (the CSS half is "Touch" in ui.css, the input mode is `data-input` from layout.ts).
 */

export type SwipeDir = "left" | "right" | "up" | "down";
export interface SwipeInfo { dir: SwipeDir; dx: number; dy: number; ms: number; /** the finger started within `edge` px of the left/right window edge */ fromEdge: "left" | "right" | null }

export const SWIPE_MIN_PX = 56; // shortest drag that counts as a swipe
export const SWIPE_MAX_MS = 700; // slower is a drag, not a swipe
export const EDGE_PX = 24; // "from the edge" = the first 24 CSS px

/** The pure decision: a quick, mostly straight drag is a swipe; anything else is null. */
export function swipeOf(dx: number, dy: number, ms: number, startX: number, width: number): SwipeInfo | null {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ms > SWIPE_MAX_MS || Math.max(ax, ay) < SWIPE_MIN_PX || Math.min(ax, ay) * 1.6 > Math.max(ax, ay)) return null;
  const dir: SwipeDir = ax > ay ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  const fromEdge = startX <= EDGE_PX ? "left" : startX >= width - EDGE_PX ? "right" : null;
  return { dir, dx, dy, ms, fromEdge };
}

/**
 * Calls `onSwipe` for a swipe that starts inside `el` (or anywhere when `el` is the document). A swipe does not
 * cancel the taps and scrolls under it: it is only reported. Returns the function that stops it.
 */
export function onSwipe(el: HTMLElement | Document, onSwipe: (s: SwipeInfo) => void): () => void {
  let x = 0, y = 0, t = 0, on = false;
  const start = (e: Event) => {
    const touches = (e as TouchEvent).touches;
    if (touches.length !== 1) { on = false; return; }
    const f = touches[0];
    if (!f) { on = false; return; }
    x = f.clientX; y = f.clientY; t = Date.now(); on = true;
  };
  const end = (e: Event) => {
    if (!on) return;
    on = false;
    const c = (e as TouchEvent).changedTouches[0];
    if (!c) return;
    const s = swipeOf(c.clientX - x, c.clientY - y, Date.now() - t, x, window.innerWidth);
    if (s) onSwipe(s);
  };
  el.addEventListener("touchstart", start, { passive: true });
  el.addEventListener("touchend", end, { passive: true });
  el.addEventListener("touchcancel", () => { on = false; }, { passive: true });
  return () => { el.removeEventListener("touchstart", start); el.removeEventListener("touchend", end); };
}

/** Friction of a flick: the speed (px/ms) left after `ms`, and the distance covered meanwhile. */
export function flingStep(v: number, ms: number): { v: number; dist: number } {
  const keep = Math.pow(0.0025, ms / 1000); // loses 99.75% of its speed in a second
  return { v: v * keep, dist: v * ms * (1 + keep) / 2 };
}
