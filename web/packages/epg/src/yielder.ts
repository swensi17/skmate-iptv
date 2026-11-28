/*
 * Background guide work (a download of tens of megabytes, reading the stored guide) shares the TV's one thread with
 * the remote. It runs in slices: a slice ends after SLICE_MS of work and the thread is given back, and while keys are
 * being pressed it waits until they stop, so a press is never queued behind guide work.
 */

/** Work done before the thread is given back: short enough that a key press waits at most this long. */
const SLICE_MS = 8;
/** After a key press, background work waits this long for the next one before it goes on. */
const QUIET_MS = 200;

const clock = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

let lastInput = -Infinity;
let sliceStart = clock();

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  const touch = () => { lastInput = clock(); };
  for (const type of ["keydown", "keyup", "wheel", "pointerdown"]) {
    try { document.addEventListener(type, touch, { capture: true, passive: true }); } catch { /* an engine without options */ }
  }
}

/**
 * A task with no delay: in a browser through a MessageChannel (a nested setTimeout(0) is held back 4 ms, which over
 * thousands of slices of a big guide added up to more waiting than working); elsewhere (tests, Node) setTimeout.
 */
const post: (f: () => void) => void = (() => {
  if (typeof document === "undefined" || typeof MessageChannel === "undefined") return (f) => { setTimeout(f, 0); };
  const queue: Array<() => void> = [];
  const channel = new MessageChannel();
  channel.port1.onmessage = () => { const f = queue.shift(); if (f) f(); };
  return (f) => { queue.push(f); channel.port2.postMessage(0); };
})();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Gives the thread back now (a key press, a frame), and waits while the remote is in use. */
let turns = 0;
export async function yieldNow(): Promise<void> {
  // Every third turn is a real timer, not a message: on the TV's Chromium 63 a chain of messages starved the timers and the
  // painting for tens of seconds while a big guide was matched (measured: a 22 s freeze of a 3760-channel list).
  if (++turns % 3 === 0) await sleep(3);
  else await new Promise<void>((resolve) => post(resolve));
  while (clock() - lastInput < QUIET_MS) await sleep(QUIET_MS - (clock() - lastInput) + 1);
  sliceStart = clock();
}

/** Gives the thread back when the current slice of work has run long enough; otherwise goes straight on. */
export function breathe(): Promise<void> | void {
  if (clock() - sliceStart < SLICE_MS && clock() - lastInput >= QUIET_MS) return undefined;
  return yieldNow();
}

/** Tests: a key was pressed now. */
export function noteInput(at: number = clock()): void { lastInput = at; }
