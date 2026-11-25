import { useEffect, useRef, type MutableRef } from "preact/hooks";
import { isBack } from "./dpad";

/**
 * Back (and a right click) close this dialog only, one step: a dialog opened from inside a sheet must not let the
 * app's own Back lower the sheet too. Acts only while [root] holds the topmost open dialog (`[data-modal]`), so a
 * question opened over it gets Back first.
 */
export function useOwnBack(root: MutableRef<HTMLElement | null>, onBack: () => void): void {
  const handler = useRef(onBack);
  handler.current = onBack;
  useEffect(() => {
    const top = () => {
      const box = root.current;
      if (!box) return false;
      const modals = document.querySelectorAll("[data-modal]");
      const last = modals[modals.length - 1];
      return !!last && (last === box || box.contains(last));
    };
    const onKey = (e: KeyboardEvent) => {
      if (!isBack(e) || !top()) return;
      if (document.activeElement instanceof HTMLInputElement && e.key === "Backspace") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      handler.current();
    };
    const onContext = (e: MouseEvent) => {
      if (!top()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      handler.current();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("contextmenu", onContext, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("contextmenu", onContext, true);
    };
  }, []);
}
