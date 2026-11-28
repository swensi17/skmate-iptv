import { describe, expect, it } from "vitest";
import { parseM3U } from "./parse";
import { parseM3UChunked } from "./chunked";

function playlist(n: number, eol = "\n"): string {
  const out = ["﻿#EXTM3U"];
  for (let i = 0; i < n; i++) out.push(`#EXTINF:-1 tvg-id="id${i}" group-title="G${i % 7}",Канал ${i}`, `http://s/${i}.m3u8`);
  return out.join(eol);
}

describe("parseM3UChunked", () => {
  it("gives exactly what parseM3U gives, in several slices", async () => {
    const text = playlist(2000);
    let yields = 0;
    const got = await parseM3UChunked(text, { budgetMs: 0, yieldFn: async () => { yields++; } });
    expect(got).toEqual(parseM3U(text));
    expect(got).toHaveLength(2000);
    expect(yields).toBeGreaterThan(5);
  });

  it("reads Windows line ends and a last line without a line end", async () => {
    const text = playlist(100, "\r\n");
    const got = await parseM3UChunked(text, { budgetMs: 0, yieldFn: async () => {} });
    expect(got).toHaveLength(100);
    expect(got?.[99]?.url).toBe("http://s/99.m3u8");
  });

  it("shows the first channels early, then growing parts, and never loses a channel", async () => {
    const text = playlist(5000);
    const sizes: number[] = [];
    const got = await parseM3UChunked(text, { budgetMs: 0, milestones: [100, 1000], onPartial: (p) => sizes.push(p.length), yieldFn: async () => {} });
    expect(got).toHaveLength(5000);
    expect(sizes).toHaveLength(2);
    expect(sizes[0]).toBeGreaterThanOrEqual(100);
    expect(sizes[0]).toBeLessThan(1000);
    expect(sizes[1]).toBeGreaterThanOrEqual(1000);
    // Ids are stable (tvg-id and name, 2.6.9), not places: the chunked read gives the same ids as the one-go read, all different.
    expect(got?.map((c) => c.id)).toEqual(parseM3U(text).map((c) => c.id));
    expect(new Set(got?.map((c) => c.id)).size).toBe(5000);
  });

  it("a partial list is a copy: later reading does not change it", async () => {
    let first: unknown[] = [];
    await parseM3UChunked(playlist(3000), { budgetMs: 0, milestones: [50], onPartial: (p) => { first = p; }, yieldFn: async () => {} });
    expect(first.length).toBeLessThan(3000);
  });

  it("stops at once when cancelled", async () => {
    let calls = 0;
    const got = await parseM3UChunked(playlist(3000), { budgetMs: 0, cancelled: () => ++calls > 3, yieldFn: async () => {} });
    expect(got).toBeNull();
  });

  it("works with the real yield (MessageChannel or timer)", async () => {
    expect(await parseM3UChunked(playlist(500), { budgetMs: 0 })).toHaveLength(500);
  });
});
