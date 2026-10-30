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
  return !off;
}

/** Watches frame gaps; calls [onSlow] once when [SLOW_FRAMES_TO_THROTTLE] frames in a row took over [SLOW_FRAME_MS]. */
export function watchFrames(onSlow: () => void, raf: (cb: (t: number) => void) => number = requestAnimationFrame): () => void {
  let last = -1;
  let slow = 0;
  let stopped = false;
  const tick = (t: number) => {
    if (stopped) return;
    if (last >= 0) {
      slow = t - last > SLOW_FRAME_MS ? slow + 1 : 0;
      if (slow >= SLOW_FRAMES_TO_THROTTLE) { onSlow(); return; }
    }
    last = t;
    raf(tick);
  };
  raf(tick);
  return () => { stopped = true; };
}
