/**
 * A finger held on a row (compact layout): the same "menu" the remote's held OK or the Menu key opens. The WebView's own
 * `contextmenu` on a long press is not relied on: this timer works the same everywhere. One finger at a time, so the
 * state is the module's, not a component's.
 */
const HOLD_MS = 550;
const SLOP = 10;

let timer: ReturnType<typeof setTimeout> | undefined;
let startX = 0;
let startY = 0;
let firedAt = 0;

const cancel = (): void => { clearTimeout(timer); timer = undefined; };

/** Touch handlers to spread on a button: [onHold] fires after a still, long touch. */
export function holdProps(onHold: () => void): {
  onTouchStart: (e: TouchEvent) => void; onTouchMove: (e: TouchEvent) => void; onTouchEnd: () => void; onTouchCancel: () => void;
} {
  return {
    onTouchStart: (e) => {
      cancel();
      const t = e.touches[0];
      if (!t || e.touches.length > 1) return;
      startX = t.clientX; startY = t.clientY; firedAt = 0;
      timer = setTimeout(() => { timer = undefined; firedAt = Date.now(); onHold(); }, HOLD_MS);
    },
    onTouchMove: (e) => {
      const t = e.touches[0];
      if (t && Math.abs(t.clientX - startX) + Math.abs(t.clientY - startY) > SLOP) cancel();
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
  };
}

/** True (once) when the click that follows a finger's hold must be ignored: the hold already did its work. */
export function holdSpent(): boolean {
  if (firedAt !== 0 && Date.now() - firedAt < 1500) { firedAt = 0; return true; }
  return false;
}
