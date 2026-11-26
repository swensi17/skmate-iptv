/**
 * Adaptive motion, the web counterpart of the Android MotionPrefs: animations are on unless the user
 * turned them off, or the page measured slow frames. Slow devices get an instant interface instead of a stuttering one.
 */
export type MotionSetting = "auto" | "on" | "off";

const SLOW_FRAME_MS = 50;
const SLOW_FRAMES_TO_THROTTLE = 6;

export function applyMotion(setting: MotionSetting, throttled: boolean, root: HTMLElement = document.documentElement): boolean {
  const off = setting === "off" || (setting === "auto" && throttled);
  root.setAttribute("data-motion", off ? "off" : "on");
  root.setAttribute("data-motion-pref", setting); // what the viewer chose: "auto" may be slowed by the page, "off" never animates
  return !off;
}

/** How long frames are watched after the start and after each press or pointer move: that is when things move. */
const WATCH_MS = 4000;
const WAKE_EVENTS = ["keydown", "mousemove", "wheel"];

/**
 * Watches frame gaps; calls [onSlow] once when [SLOW_FRAMES_TO_THROTTLE] frames in a row took over [SLOW_FRAME_MS].
 *
 * Only for [WATCH_MS] after the start and after each input on [wake] (the document by default): an endless
 * requestAnimationFrame loop would keep an idle TV producing frames all evening (a playing channel included), for
 * nothing. A pause in watching never counts as a slow frame.
 */
export function watchFrames(
  onSlow: () => void,
  raf: (cb: (t: number) => void) => number = requestAnimationFrame,
  wake: Pick<EventTarget, "addEventListener" | "removeEventListener"> | null = typeof document !== "undefined" ? document : null,
): () => void {
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  let last = -1;
  let slow = 0;
  let stopped = false;
  let running = false;
  let until = now() + WATCH_MS;
  const stop = () => {
    stopped = true;
    for (const e of WAKE_EVENTS) wake?.removeEventListener(e, onInput, true);
  };
  const tick = (t: number) => {
    if (stopped) return;
    if (t > until) { running = false; last = -1; slow = 0; return; }
    if (last >= 0) {
      slow = t - last > SLOW_FRAME_MS ? slow + 1 : 0;
      if (slow >= SLOW_FRAMES_TO_THROTTLE) { stop(); onSlow(); return; }
    }
    last = t;
    raf(tick);
  };
  function onInput() {
    until = now() + WATCH_MS;
    if (!running && !stopped) { running = true; raf(tick); }
  }
  for (const e of WAKE_EVENTS) wake?.addEventListener(e, onInput, true);
  running = true;
  raf(tick);
  return stop;
}
