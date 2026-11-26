import { describe, expect, it } from "vitest";
import { watchFrames } from "./motion";

function fakeRaf() {
  let cb: ((t: number) => void) | null = null;
  return { raf: (f: (t: number) => void) => { cb = f; return 1; }, frame: (t: number) => { const f = cb; cb = null; f?.(t); } };
}

describe("watchFrames", () => {
  it("fires after six slow frames in a row", () => {
    const r = fakeRaf();
    let slow = 0;
    watchFrames(() => slow++, r.raf);
    let t = 0;
    r.frame(t);
    for (let i = 0; i < 6; i++) r.frame((t += 80));
    expect(slow).toBe(1);
  });
  it("a fast frame resets the count", () => {
    const r = fakeRaf();
    let slow = 0;
    watchFrames(() => slow++, r.raf);
    let t = 0;
    r.frame(t);
    for (let i = 0; i < 5; i++) r.frame((t += 80));
    r.frame((t += 16));
    for (let i = 0; i < 5; i++) r.frame((t += 80));
    expect(slow).toBe(0);
  });
  it("stops asking for frames when nothing happens, and starts again on input", () => {
    const r = fakeRaf();
    let asked = 0;
    const raf = (f: (t: number) => void) => { asked++; return r.raf(f); };
    const listeners: Array<() => void> = [];
    const wake = { addEventListener: (_: string, f: unknown) => { listeners.push(f as () => void); }, removeEventListener: () => {} };
    watchFrames(() => {}, raf, wake);
    const start = performance.now();
    r.frame(start + 16);
    r.frame(start + 60_000); // long after the watch window: the loop ends here
    const before = asked;
    r.frame(start + 60_016);
    expect(asked).toBe(before);
    listeners[0]?.(); // a key press
    expect(asked).toBe(before + 1);
  });
});
