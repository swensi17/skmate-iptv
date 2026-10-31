export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** The largest scale at which the whole 1920×1080 design fits the window, never beyond what the screen can show crisply. */
export function fitScale(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  return Math.min(width / STAGE_W, height / STAGE_H);
}

/** Keeps `--stage-scale` on the root in step with the window; returns the function that stops it. */
export function fitStage(root: HTMLElement = document.documentElement, win: Window = window): () => void {
  const apply = () => root.style.setProperty("--stage-scale", String(fitScale(win.innerWidth, win.innerHeight)));
  apply();
  win.addEventListener("resize", apply);
  return () => win.removeEventListener("resize", apply);
}
