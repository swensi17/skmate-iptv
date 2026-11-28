import { useEffect } from "preact/hooks";

/**
 * While [active], [onLeave] runs as soon as the focus goes anywhere outside [selector] (the programme column with its
 * days): the channels screen and the player's panel both widen their list again by it (2.7.1).
 */
export function useFocusInside(active: boolean, selector: string, onLeave: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onIn = (e: FocusEvent) => { if (!(e.target as HTMLElement | null)?.closest?.(selector)) onLeave(); };
    document.addEventListener("focusin", onIn, true);
    return () => document.removeEventListener("focusin", onIn, true);
  }, [active, selector]);
}
