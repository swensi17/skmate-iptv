import { useEffect, useRef, useState } from "preact/hooks";

/**
 * Gives the focus back to the control that opened a dialog or a sheet once it closes ([closing] turns true, or it
 * unmounts), as a TV remote expects: Back lands on the row you came from, not on the top of the screen.
 *
 * Attach the returned ref to the dialog's root. The focus is moved only when it is still inside that root or lost
 * (on the page body), so a screen that has taken the focus for itself meanwhile keeps it. When the opener is gone
 * (a deleted row), the focus goes to the first control of the topmost open dialog, if there is one.
 */
export function useReturnFocus<T extends HTMLElement = HTMLDivElement>(closing = false, enabled = true) {
  const root = useRef<T>(null);
  // Read while rendering, before any effect of the dialog moves the focus into it.
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  const id = opener?.dataset?.focus ?? null;
  const done = useRef(false);

  const give = () => {
    if (done.current || !enabled) return;
    done.current = true;
    const box = root.current;
    setTimeout(() => {
      const active = document.activeElement;
      const lost = !active || active === document.body || !active.isConnected;
      if (!lost && !(box && box.contains(active))) return;
      const byId = id === null ? undefined : Array.from(document.querySelectorAll<HTMLElement>("[data-focus]")).find((e) => e.dataset.focus === id && !(box && box.contains(e)));
      const target = opener && opener.isConnected && !(box && box.contains(opener)) ? opener : byId;
      if (target) { target.focus(); return; }
      const modals = Array.from(document.querySelectorAll("[data-modal]")).filter((m) => !(box && box.contains(m)));
      const top = modals[modals.length - 1];
      top?.querySelector<HTMLElement>("[data-focus]")?.focus();
    }, 0);
  };
  useEffect(() => { if (closing) give(); }, [closing]);
  useEffect(() => () => give(), []);
  return root;
}
