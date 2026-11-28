import { focusWithoutScroll } from "./legacy";

/**
 * The mouse and a Magic Remote point instead of pressing arrows: hovering a control focuses it (the same
 * highlight the D-pad gives), so one look serves both. Only a real movement counts: a layout change under
 * a resting cursor also makes the browser send a mouse event, and that must not steal the keyboard's focus.
 * Returns the function that removes the handler.
 */
export function installPointer(): () => void {
  const onMove = (e: MouseEvent) => {
    // A phone used as a touchpad (Android TV remote apps, #752) jitters by a pixel or two: that is not a move.
    if (Math.abs(e.movementX) + Math.abs(e.movementY) < 3) return;
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-focus]");
    if (!target || target === document.activeElement) return;
    // A text field takes focus only by a click: focus would open the on-screen keyboard on a TV, and a field
    // being typed in must keep its focus (and caret) while the pointer passes over other controls.
    if (target instanceof HTMLInputElement && target.type !== "file") return;
    if (document.activeElement instanceof HTMLInputElement) return;
    const modals = document.querySelectorAll("[data-modal]");
    const modal = modals.length > 0 ? modals[modals.length - 1] : null;
    if (modal && !modal.contains(target)) return; // a dialog keeps the pointer inside it, as it keeps the remote
    focusWithoutScroll(target); // focus({ preventScroll }) is Chromium 64+: older TVs would scroll the list
  };
  document.addEventListener("mousemove", onMove, { passive: true });
  return () => document.removeEventListener("mousemove", onMove);
}
