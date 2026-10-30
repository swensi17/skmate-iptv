import { nextFocus, type Box, type Direction } from "./spatial";

/** Remote-control key codes of the TV platforms; the browser's own arrows are handled by `key`. */
export const KEY = { BACK_WEBOS: 461, BACK_TIZEN: 10009, ENTER: 13, BACKSPACE: 8, ESC: 27 } as const;

const DIRS: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
const DIR_CODES: Record<number, Direction> = { 38: "up", 40: "down", 37: "left", 39: "right" };

export function isBack(e: KeyboardEvent): boolean {
  return e.keyCode === KEY.BACK_WEBOS || e.keyCode === KEY.BACK_TIZEN || e.key === "Escape" || e.key === "BrowserBack";
}

function boxes(root: ParentNode): Array<Box & { el: HTMLElement }> {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-focus]")).map((el, i) => {
    const r = el.getBoundingClientRect();
    return { id: el.dataset.focus || String(i), x: r.left, y: r.top, w: r.width, h: r.height, el };
  });
}

/**
 * One keydown handler for the whole app: arrows move focus between `[data-focus]` elements by geometry,
 * Back goes to [onBack]. Elements never register themselves, so a screen is just markup.
 * Returns the function that removes the handler.
 */
export function installDpad(onBack: () => boolean): () => void {
  const handler = (e: KeyboardEvent) => {
    const active = document.activeElement as HTMLElement | null;
    const typing = active instanceof HTMLInputElement;
    if (isBack(e) && !(typing && e.key === "Backspace")) {
      if (onBack()) e.preventDefault();
      return;
    }
    const dir = DIRS[e.key] ?? DIR_CODES[e.keyCode];
    if (!dir) return;
    if (typing && (dir === "left" || dir === "right")) return; // the caret moves inside a field
    // An open dialog (`[data-modal]`) owns the remote: focus cannot leave it.
    const all = boxes(document.querySelector("[data-modal]") ?? document);
    const cur = active?.dataset.focus ?? null;
    const target = nextFocus(all.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })), cur, dir);
    if (target !== null) {
      all.find((b) => b.id === target)?.el.focus();
      e.preventDefault();
    } else if (!typing) {
      e.preventDefault();
    }
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}

/** Puts focus on the first (or the named) focusable element of a freshly shown screen. */
export function focusFirst(root: ParentNode = document, id?: string): void {
  const el = id ? root.querySelector<HTMLElement>(`[data-focus="${id}"]`) : root.querySelector<HTMLElement>("[data-focus]");
  el?.focus();
}
