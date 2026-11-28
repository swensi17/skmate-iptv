import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const g = globalThis;
g.__SKMATE_TEST__ = true;
new Function(readFileSync(new URL("./shell.js", import.meta.url), "utf8"))();
const sh = g.__skmateShell;
const blank = { current: null, previous: null, candidate: null, tries: 0, bad: [] };

describe("the TV shell (updates over the air, 2.7.1)", () => {
  it("starts a new candidate twice at most, else the one that held", () => {
    const s = { ...blank, current: { build: 1, version: "2.7.1" }, candidate: { build: 2, version: "2.7.2" } };
    expect(sh.pick(s)).toEqual({ build: s.candidate, trial: true });
    expect(sh.pick({ ...s, tries: 2 })).toEqual({ build: s.current, trial: false });
    expect(sh.pick(blank)).toBeNull();
  });
  it("a candidate that held becomes the one in use, the old one the way back", () => {
    const s = sh.promote({ ...blank, current: { build: 1 }, candidate: { build: 2 } });
    expect(s.current).toEqual({ build: 2 });
    expect(s.previous).toEqual({ build: 1 });
    expect(s.candidate).toBeNull();
  });
  it("a build that failed is never taken again; the one before it runs", () => {
    const s = sh.fail({ ...blank, current: { build: 2 }, previous: { build: 1 } }, 2);
    expect(s.current).toEqual({ build: 1 });
    expect(s.bad).toEqual([2]);
    expect(sh.pick(s)?.build).toEqual({ build: 1 });
  });
  it("takes only a newer, whole update meant for this shell", () => {
    const m = { build: 5, version: "2.7.2", files: { "a.js": {} }, entry: "a.js", polyfills: "p.js", minShell: 1 };
    expect(sh.wanted(m, blank, 4)).toBe(true);
    expect(sh.wanted(m, blank, 5)).toBe(false);
    expect(sh.wanted({ ...m, minShell: sh.SHELL + 1 }, blank, 4)).toBe(false);
    expect(sh.wanted(m, { ...blank, bad: [5] }, 4)).toBe(false);
    expect(sh.wanted({ ...m, entry: undefined }, blank, 4)).toBe(false);
  });
  it("checks files with SHA-256 like any other tool", () => {
    const b = Buffer.from("SkMate".repeat(5000));
    expect(sh.sha256(b.buffer.slice(b.byteOffset, b.byteOffset + b.length))).toBe(createHash("sha256").update(b).digest("hex"));
  });
  it("points a stylesheet's fonts and pictures at the kept copies, never scripts", () => {
    const out = sh.rewrite(`a{src:url(./assets/font-1.woff2)} b{background:url("logo.png")} x="./assets/chunk-legacy.js"`, { "font-1.woff2": "blob:1", "logo.png": "blob:2", "chunk-legacy.js": "blob:3" });
    expect(out).toBe(`a{src:url(blob:1)} b{background:url("blob:2")} x="./assets/chunk-legacy.js"`);
  });
});

describe("update.json must carry the author's signature", () => {
  it("opens only what the key signed", async () => {
    const { generateKeyPairSync, sign } = await import("node:crypto");
    const nacl = (await import("tweetnacl")).default;
    const k = generateKeyPairSync("ed25519");
    const pub = k.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("base64");
    const payload = JSON.stringify({ build: 9, version: "2.7.9" });
    const sig = sign(null, Buffer.from(payload), k.privateKey).toString("base64");
    expect(sh.opened({ payload, sig }, nacl, pub)).toEqual({ build: 9, version: "2.7.9" });
    expect(sh.opened({ payload: payload.replace("9,", "10,"), sig }, nacl, pub)).toBeNull();
    expect(sh.opened({ payload, sig }, nacl)).toBeNull(); // another key: the author's
    expect(sh.opened({ build: 9 }, nacl, pub)).toBeNull();
  });
});
