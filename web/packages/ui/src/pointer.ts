/**
 * The mouse and a Magic Remote point instead of pressing arrows: hovering a control focuses it (the same
 * highlight the D-pad gives), so one look serves both. Only a real movement counts: a layout change under
 * a resting cursor also makes the browser send a mouse event, and that must not steal the keyboard's focus.
 * Returns the function that removes the handler.
 */
export function installPointer(): () => void {
  const onMove = (e: MouseEvent) => {
    if (e.movementX === 0 && e.movementY === 0) return;
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-focus]");
    if (!target || target === document.activeElement) return;
    const modals = document.querySelectorAll("[data-modal]");
    const modal = modals.length > 0 ? modals[modals.length - 1] : null;
    if (modal && !modal.contains(target)) return; // a dialog keeps the pointer inside it, as it keeps the remote
    target.focus({ preventScroll: true });
  };
  document.addEventListener("mousemove", onMove, { passive: true });
  return () => document.removeEventListener("mousemove", onMove);
}
