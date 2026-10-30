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
});
