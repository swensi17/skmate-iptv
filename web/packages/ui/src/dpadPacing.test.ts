import { describe, expect, it } from "vitest";
import { makeRepeatGate } from "./dpad";

describe("held-key pacing (MainActivity.dropRepeatThatOutrunsScreen)", () => {
  it("lets a repeat through only after the previous step was drawn; single presses are never dropped", () => {
    const queue: Array<() => void> = [];
    const tick = () => { const run = queue.splice(0); run.forEach((f) => f()); };
    const gate = makeRepeatGate((cb) => { queue.push(cb); });
    const down = { repeat: false, keyCode: 40 };
    const rep = { repeat: true, keyCode: 40 };
    expect(gate(down)).toBe(true);
    expect(gate(rep)).toBe(true);   // first repeat opens nothing: gate closes
    expect(gate(rep)).toBe(false);  // before the frame: dropped
    expect(gate(down)).toBe(true);  // a fresh press is never dropped
    tick(); expect(gate(rep)).toBe(false); // the frame started, not yet drawn
    tick(); expect(gate(rep)).toBe(true);  // drawn: next repeat passes
  });
  it("keys that are not paced pass", () => {
    const gate = makeRepeatGate(() => undefined);
    expect(gate({ repeat: true, keyCode: 13 })).toBe(true);
    expect(gate({ repeat: true, keyCode: 13 })).toBe(true);
  });
});
