import { nextFocus, type Box, type Direction } from "./spatial";

/** Remote-control key codes of the TV platforms; the browser's own arrows are handled by `key`. */
export const KEY = { BACK_WEBOS: 461, BACK_TIZEN: 10009, ENTER: 13, BACKSPACE: 8, ESC: 27 } as const;

const DIRS: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
const DIR_CODES: Record<number, Direction> = { 38: "up", 40: "down", 37: "left", 39: "right" };

/** The remote's Menu key (Android KEYCODE_MENU 82); `ContextMenu` / 93 on a PC keyboard. Android opens the same menu as a long OK. */
export function isMenuKey(e: KeyboardEvent): boolean {
  // 82 is also the letter R of a PC keyboard: that one has a one-character `key`, a remote's Menu does not.
  if (e.key === "ContextMenu" || e.key === "Menu" || e.keyCode === 93) return true;
  return e.keyCode === 82 && !(e.key && e.key.length === 1);
}

/** Back held this long (key repeats counted as MainActivity.kt LONG_BACK_REPEATS = 12, or 1 s) closes the app. */
export const LONG_BACK_REPEATS = 12;
const LONG_BACK_MS = 1000;
/** The keys a held press is paced for (MainActivity.kt PACED_KEYS): the arrows, CH+/-, PageUp/PageDown. */
const PACED = [37, 38, 39, 40, 33, 34, 427, 428];

/**
 * Held-key pacing (MainActivity.kt dropRepeatThatOutrunsScreen): a repeat of an arrow or CH key is let through only
 * once the frame of the previous one has been drawn; the repeats in between are dropped. Single presses never are.
 * [frame] is injectable for tests.
 */
export function makeRepeatGate(frame: (cb: () => void) => void): (e: { repeat: boolean; keyCode: number }) => boolean {
  let open = true;
  return (e) => {
    if (!e.repeat || !PACED.includes(e.keyCode)) return true;
    if (!open) return false;
    open = false;
    // First callback: the frame that draws the step has started. The next one means it was drawn.
    frame(() => frame(() => { open = true; }));
    return true;
  };
}

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
export function installDpad(onBack: () => boolean, onLongBack?: () => void): () => void {
  const gate = makeRepeatGate((cb) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(cb) : void setTimeout(cb, 16)));
  let backHeld = 0, backFrom = 0;
  const handler = (e: KeyboardEvent) => {
    const active = document.activeElement as HTMLElement | null;
    const typing = active instanceof HTMLInputElement;
    if (isBack(e) && !(typing && e.key === "Backspace")) {
      if (e.repeat) {
        // Back held (12 repeats, about a second) closes the app outright, as on Android (MainActivity.kt:66-75);
        // the repeats before that are not new Backs.
        if (!backFrom) backFrom = Date.now();
        if (++backHeld >= LONG_BACK_REPEATS || Date.now() - backFrom >= LONG_BACK_MS) {
          backHeld = 0; backFrom = 0;
          onLongBack?.();
        }
        e.preventDefault();
        return;
      }
      backHeld = 0; backFrom = 0;
      if (onBack()) e.preventDefault();
      return;
    }
    const dir = DIRS[e.key] ?? DIR_CODES[e.keyCode];
    if (!dir) return;
    // The caret moves inside a field; at its edge the arrow leaves, so the controls beside a field stay reachable.
    if (typing && (dir === "left" || dir === "right")) {
      const f = active as HTMLInputElement;
      const start = f.selectionStart, end = f.selectionEnd;
      const atEdge = start === null || end === null || (dir === "left" ? start === 0 && end === 0 : start === f.value.length && end === f.value.length);
      if (!atEdge) return;
    }
    // An open dialog (`[data-modal]`) owns the remote: focus cannot leave it.
    const modals = document.querySelectorAll("[data-modal]");
    let all = boxes(modals.length > 0 ? (modals[modals.length - 1] as Element) : document);
    // A collapsed side menu (`[data-collapsed]`) is out of sight: only a press of Left may bring the focus to it.
    if (dir !== "left") all = all.filter((b) => !b.el.closest("[data-collapsed]") || active?.closest("[data-collapsed]"));
    const cur = active?.dataset.focus ?? null;
    const target = nextFocus(all.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })), cur, dir);
    if (target !== null) {
      all.find((b) => b.id === target)?.el.focus();
      e.preventDefault();
    } else if (!typing) {
      e.preventDefault();
    }
  };
  // A right click is Back for a mouse, as the Back key is for a remote.
  // A long press on a touch screen sends the same event: that is not a Back, and must not open the browser menu either.
  const onContext = (e: MouseEvent) => { e.preventDefault(); if (document.documentElement.getAttribute("data-input") !== "touch") onBack(); };
  // A repeat that outruns the screen is dropped (MainActivity.kt:85-107) in the capture phase, before any row sees it.
  const pace = (e: KeyboardEvent) => { if (!gate(e)) { e.preventDefault(); e.stopImmediatePropagation(); } };
  window.addEventListener("keydown", pace, true);
  document.addEventListener("keydown", handler);
  document.addEventListener("contextmenu", onContext);
  return () => {
    window.removeEventListener("keydown", pace, true);
    document.removeEventListener("keydown", handler);
    document.removeEventListener("contextmenu", onContext);
  };
}

/**
 * Puts focus on the first (or the named) focusable element of a freshly shown screen. The name is compared as
 * text, not put into a selector: a group called `HD "Orig"` must not break the lookup.
 */
export function focusFirst(root: ParentNode = document, id?: string): void {
  const all = Array.from(root.querySelectorAll<HTMLElement>("[data-focus]"));
  const el = id === undefined ? all[0] : all.find((e) => e.dataset.focus === id);
  el?.focus();
}
