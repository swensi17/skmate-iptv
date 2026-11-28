import { describe, expect, it } from "vitest";
import { createLogoGate } from "./logoGate";

function fake() {
  let cb: (() => void) | null = null;
  return { set: (f: () => void) => { cb = f; return 1; }, clear: () => { cb = null; }, fire: () => { const f = cb; cb = null; f && f(); }, pending: () => cb !== null };
}

describe("logoGate", () => {
  it("loads at once while the list is still", () => {
    const g = createLogoGate(fake(), 100, 2);
    let n = 0;
    g.request("a", () => n++);
    expect(n).toBe(1);
  });
  it("holds loads while moving and releases them after the quiet time", () => {
    const t = fake(), g = createLogoGate(t, 100, 2);
    let n = 0;
    g.busy();
    g.request("a", () => n++);
    g.busy();
    expect(n).toBe(0);
    t.fire();
    expect(n).toBe(1);
  });
  it("caps concurrent loads and frees a slot on done", () => {
    const g = createLogoGate(fake(), 100, 2);
    const got: string[] = [];
    ["a", "b", "c"].forEach((s) => g.request(s, () => got.push(s)));
    expect(got).toEqual(["a", "b"]);
    g.done("a");
    expect(got).toEqual(["a", "b", "c"]);
  });
  it("a cancelled request never loads; a seen logo skips the queue", () => {
    const t = fake(), g = createLogoGate(t, 100, 1);
    const got: string[] = [];
    g.busy();
    const cancel = g.request("a", () => got.push("a"));
    cancel();
    t.fire();
    expect(got).toEqual([]);
    g.request("b", () => got.push("b")); g.done("b");
    g.busy();
    g.request("b", () => got.push("b2"));
    expect(got).toEqual(["b", "b2"]);
  });
});
