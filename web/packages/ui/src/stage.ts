export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** The largest scale at which the whole 1920×1080 design fits the window, never beyond what the screen can show crisply. */
export function fitScale(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  const scale = Math.min(width / STAGE_W, height / STAGE_H);
  // A window a pixel or two off 1920×1080 (the Windows app's zoom rounds to whole pixels) is drawn unscaled: a
  // scale of 0.999 already blurs every letter, a lost pixel at the edge does not show.
  return Math.abs(scale - 1) < 0.005 ? 1 : scale;
}

/**
 * Where the 1920×1080 box sits so that it is centred, in whole pixels: a centre at half a pixel (an odd window size)
 * smears every letter even when the box is not scaled at all.
 */
export function stageOffset(width: number, height: number): { left: number; top: number } {
  return { left: Math.round((width - STAGE_W) / 2), top: Math.round((height - STAGE_H) / 2) };
}

/** Keeps `--stage-scale` and the box position on the root in step with the window; returns the function that stops it. */
export function fitStage(root: HTMLElement = document.documentElement, win: Window = window): () => void {
  let lastW = -1;
  let lastH = -1;
  const typing = () => {
    const el = win.document.activeElement;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  };
  const apply = () => {
    const w = win.innerWidth;
    const h = win.innerHeight;
    // A TV's on-screen keyboard makes the window shorter while a field is being typed in. Refitting then would shrink
    // the whole interface away from the viewer; the keyboard only covers the bottom, so the stage stays as it was
    // (the entry panel keeps its field near the top for this reason) and is fitted again once the keyboard is gone.
    if (typing() && w === lastW && h < lastH) return;
    lastW = w;
    lastH = h;
    const { left, top } = stageOffset(w, h);
    root.style.setProperty("--stage-scale", String(fitScale(w, h)));
    root.style.setProperty("--stage-left", `${left}px`);
    root.style.setProperty("--stage-top", `${top}px`);
  };
  apply();
  // Leaving a field may come with the keyboard closing and no resize at all: fit again then.
  const onBlur = () => setTimeout(apply, 0);
  win.addEventListener("resize", apply);
  win.document.addEventListener("focusout", onBlur);
  return () => {
    win.removeEventListener("resize", apply);
    win.document.removeEventListener("focusout", onBlur);
  };
}
