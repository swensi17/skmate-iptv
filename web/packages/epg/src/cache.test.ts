import { describe, expect, it } from "vitest";
import type { Channel } from "@skmate/core";
import { BLOCK_MS, DAY_MS, GuideCache, GuideWriter, MEMORY_PAST_MS, readGuideMeta, type GuideMeta } from "./cache";
import { MemoryKv, type GuideKv, type KeyRange } from "./kv";
import { GuideData } from "./store";
import { syncGuides } from "./sync";

const H = 3_600_000;
const now = Date.UTC(2026, 10, 26, 10, 20);
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:T]|\..*/g, "") + " +0000";

/** [channels] guide channels, a programme every hour from a day back to [days] ahead. */
function guide(channels: number, days: number): string {
  const out = ["<tv>"];
  for (let c = 0; c < channels; c++) out.push(`<channel id="g${c}"><display-name>Канал ${c}</display-name></channel>`);
  const first = Math.floor(now / H) * H - DAY_MS;
  for (let c = 0; c < channels; c++) {
    for (let t = first; t < now + days * DAY_MS; t += H) {
      out.push(`<programme start="${stamp(t)}" stop="${stamp(t + H)}" channel="g${c}"><title>П ${c} ${new Date(t).getUTCHours()}</title><desc>Описание ${c} ${t}</desc></programme>`);
    }
  }
  out.push("</tv>");
  return out.join("");
}

const chans = (n: number): Channel[] => Array.from({ length: n }, (_, i) => ({ id: String(i), name: `Канал ${i}`, url: "u", group: "", tvgId: `g${i}` }));

async function stored(kv: GuideKv, channels: number, days: number, keepDays = days): Promise<GuideMeta> {
  const writer = new GuideWriter(kv, "p1", 1000);
  const { data } = await syncGuides({
    sources: [{ id: "s", name: "s", url: "http://x/g.xml" }], channels: chans(channels), now,
    open: async () => new Response(guide(channels, days)), aheadMs: keepDays * DAY_MS, pastMs: 6 * H, sink: writer,
  });
  return writer.commit(data.links, data.logos, now, keepDays);
}

describe("the guide kept in storage", () => {
  it("keeps every day chosen, and holds in memory only what is on and the hours asked for", async () => {
    const kv = new MemoryKv();
    const meta = await stored(kv, 20, 8, 7);
    expect(meta.ids).toHaveLength(20);
    expect(meta.until).toBeGreaterThanOrEqual(now + 7 * DAY_MS - H); // a week ahead, not half a day
    expect(meta.until).toBeLessThanOrEqual(now + 7 * DAY_MS + H); // and no more than the days kept
    const cache = new GuideCache(kv, "p1", meta, 0, 7);
    await cache.ensure([[now - MEMORY_PAST_MS, now + 6 * H]], now);
    let data = cache.snapshot(now);
    expect(data.nowNext("3", now).now?.title).toBe("П 3 10");
    expect(data.horizon).toBeGreaterThanOrEqual(now + 7 * DAY_MS - H);
    const first = cache.inMemory;
    expect(first).toBeLessThan(20 * 24); // well under a day per channel
    // The grid scrolled to day six: that day comes in, the rest of the week stays on disk.
    const day6 = now + 6 * DAY_MS;
    await cache.ensure([[now - MEMORY_PAST_MS, now + 6 * H], [day6, day6 + 4 * H]], now);
    data = cache.snapshot(now);
    expect(data.of("5").some((p) => p.start <= day6 && day6 < p.stop)).toBe(true);
    expect(data.of("5").some((p) => p.start === now + 3 * DAY_MS)).toBe(false);
    expect(data.stored("5")).toBe(true);
    expect(data.stored("999")).toBe(false);
    // Back to now: day six leaves memory again.
    expect(await cache.ensure([[now - MEMORY_PAST_MS, now + 6 * H]], now)).toBe(true);
    cache.snapshot(now);
    expect(cache.inMemory).toBe(first);
  });

  it("is sorted and has no programme twice, also where two downloads' batches meet", async () => {
    const kv = new MemoryKv();
    const w = new GuideWriter(kv, "p", 5);
    w.add("a", { start: now + H, stop: now + 2 * H, title: "B" });
    await w.flush();
    w.add("a", { start: now, stop: now + H, title: "A" });
    w.add("a", { start: now + H, stop: now + 2 * H, title: "B" });
    const meta = await w.commit(new Map([["1", "a"]]), new Map(), now, 7);
    const cache = new GuideCache(kv, "p", meta);
    await cache.ensure([[now, now + 3 * H]], now);
    expect(cache.snapshot(now).of("1").map((p) => p.title)).toEqual(["A", "B"]);
  });

  it("moves every programme by the time shift, and still finds their descriptions", async () => {
    const kv = new MemoryKv();
    const meta = await stored(kv, 3, 2);
    const cache = new GuideCache(kv, "p1", meta, 0, 7);
    await cache.ensure([[now - MEMORY_PAST_MS, now + 6 * H]], now);
    const before = cache.snapshot(now).nowNext("1", now).now;
    expect(await cache.setShift(-180)).toBe(true);
    await cache.ensure([[now - MEMORY_PAST_MS, now + 6 * H]], now);
    const data = cache.snapshot(now);
    expect(data.shiftMin).toBe(-180);
    const after = data.nowNext("1", now).now;
    expect(after?.title).not.toBe(before?.title);
    expect(after?.start).toBe(Math.floor(now / H) * H); // a 13:00 programme now shows at 10:00
    expect(after?.title).toBe("П 1 13");
    expect(await data.describe("1", after!)).toBe(`Описание 1 ${Math.floor(now / H) * H + 3 * H}`);
  });

  it("gives what is on now its description, and takes it back once it is over", async () => {
    const kv = new MemoryKv();
    const meta = await stored(kv, 3, 2);
    const cache = new GuideCache(kv, "p1", meta);
    await cache.ensure([[now - MEMORY_PAST_MS, now + DAY_MS]], now);
    expect(await cache.refreshNear(now)).toBe(true);
    const data = cache.snapshot(now);
    const on = data.nowNext("2", now).now!;
    expect(on.desc).toBe(`Описание 2 ${on.start}`);
    const late = data.of("2").find((p) => p.start > now + 6 * H)!;
    expect(late.desc).toBeUndefined(); // far ahead: on disk only
    expect(await data.describe("2", late)).toBe(`Описание 2 ${late.start}`);
    await cache.refreshNear(now + 2 * H);
    expect(on.desc).toBeUndefined();
  });

  it("respects fewer days kept without a new download", async () => {
    const kv = new MemoryKv();
    const meta = await stored(kv, 2, 7);
    const cache = new GuideCache(kv, "p1", meta, 0, 2);
    expect(cache.horizon(now)).toBe(now + 2 * DAY_MS);
    await cache.ensure([[now + 5 * DAY_MS, now + 5 * DAY_MS + 4 * H]], now);
    expect(cache.inMemory).toBe(0);
    expect(cache.snapshot(now).of("0")).toHaveLength(0);
  });

  it("a new download replaces the old one whole; one that fails leaves the old one", async () => {
    const kv = new MemoryKv();
    await stored(kv, 2, 1);
    const old = (await readGuideMeta(kv, "p1"))!;
    const w = new GuideWriter(kv, "p1", 2000);
    w.add("g0", { start: now, stop: now + H, title: "Новое" });
    const meta = await w.commit(new Map([["0", "g0"]]), new Map(), now, 7);
    expect(kv.keys().filter((k) => k.includes(`|${old.gen}|`))).toHaveLength(0);
    expect((await readGuideMeta(kv, "p1"))?.gen).toBe(2000);
    const failed = new GuideWriter(kv, "p1", 3000);
    failed.add("g0", { start: now, stop: now + H, title: "Сбой" });
    await failed.flush();
    await failed.abort();
    expect(kv.keys().filter((k) => k.includes("|3000|"))).toHaveLength(0);
    const cache = new GuideCache(kv, "p1", meta);
    await cache.ensure([[now, now + H]], now);
    expect(cache.snapshot(now).nowNext("0", now).now?.title).toBe("Новое");
  });

  it("two windows downloading at once: the newer guide wins, and neither deletes what the other is writing", async () => {
    const kv = new MemoryKv();
    const older = new GuideWriter(kv, "p", 1_700_000_000_000);
    const newer = new GuideWriter(kv, "p", 1_700_000_000_500);
    older.add("a", { start: now, stop: now + H, title: "Старое" });
    await older.flush();
    newer.add("a", { start: now, stop: now + H, title: "Новое" });
    await newer.flush();
    // the older finishes first: the newer one's batch must survive it
    await older.commit(new Map([["1", "a"]]), new Map(), now, 7);
    newer.add("a", { start: now + H, stop: now + 2 * H, title: "Новое 2" });
    const meta = await newer.commit(new Map([["1", "a"]]), new Map(), now, 7);
    const cache = new GuideCache(kv, "p", meta);
    await cache.ensure([[now, now + 3 * H]], now);
    expect(cache.snapshot(now).of("1").map((p) => p.title)).toEqual(["Новое", "Новое 2"]);
    expect(kv.keys().some((k) => k.includes("|1700000000000|"))).toBe(false);
    // and the other way round: an older download finishing last does not replace the newer guide
    const late = new GuideWriter(kv, "p", 1_700_000_000_100);
    late.add("a", { start: now, stop: now + H, title: "Опоздавшее" });
    expect((await late.commit(new Map([["1", "a"]]), new Map(), now, 7)).gen).toBe(1_700_000_000_500);
    expect(kv.keys().some((k) => k.includes("|1700000000100|"))).toBe(false);
  });

  it("drops the descriptions, not the guide, when the disk is full", async () => {
    class Full extends MemoryKv {
      override write(puts: ReadonlyArray<[string, unknown]>, drops?: readonly KeyRange[]): Promise<void> {
        if (puts.some(([k]) => k.startsWith("x|"))) { const e = new Error("full"); e.name = "QuotaExceededError"; return Promise.reject(e); }
        return super.write(puts, drops);
      }
    }
    const kv = new Full();
    const meta = await stored(kv, 3, 1);
    expect(meta.desc).toBe(false);
    expect(kv.keys().some((k) => k.startsWith("x|"))).toBe(false);
    const cache = new GuideCache(kv, "p1", meta);
    await cache.ensure([[now, now + H]], now);
    expect(cache.snapshot(now).nowNext("1", now).now).not.toBeNull();
  });

  it("stores a programme by the block it ends in, so one still on is found from the block of now", async () => {
    const kv = new MemoryKv();
    const w = new GuideWriter(kv, "p", 1);
    const blockStart = Math.floor(now / BLOCK_MS) * BLOCK_MS;
    w.add("a", { start: blockStart - 5 * H, stop: blockStart + H, title: "Длинный фильм" });
    const meta = await w.commit(new Map([["1", "a"]]), new Map(), now, 7);
    const cache = new GuideCache(kv, "p", meta);
    await cache.ensure([[blockStart + 30 * 60_000, blockStart + 2 * H]], blockStart + 30 * 60_000);
    expect(cache.snapshot(now).nowNext("1", blockStart + 30 * 60_000).now?.title).toBe("Длинный фильм");
  });
});

describe("the in-memory guide (no IndexedDB)", () => {
  it("moves by the time shift and back", () => {
    const d = new GuideData(new Map([["1", "a"]]), new Map([["a", [{ start: now, stop: now + H, title: "X" }]]]), now);
    const moved = d.withShift(60);
    expect(moved.of("1")[0]?.start).toBe(now + H);
    expect(moved.withShift(0).of("1")[0]?.start).toBe(now);
    // the localStorage copy is kept unshifted
    expect(GuideData.restore(moved.serialize(now)).of("1")[0]?.start).toBe(now);
  });
});

describe("a first guide kept while it downloads", () => {
  it("shows at the next start, is replaced by the complete one, and goes with a failed download", async () => {
    const kv = new MemoryKv();
    const w = new GuideWriter(kv, "p9", 4000);
    w.add("g0", { start: now, stop: now + H, title: "Частично" });
    await w.flush();
    await w.keepDraft(new Map([["0", "g0"]]), new Map(), now, 7);
    const kept = (await readGuideMeta(kv, "p9"))!;
    expect(kept.partial).toBe(true);
    const cache = new GuideCache(kv, "p9", kept);
    await cache.ensure([[now, now + H]], now);
    expect(cache.snapshot(now).nowNext("0", now).now?.title).toBe("Частично");
    const done = await w.commit(new Map([["0", "g0"]]), new Map(), now, 7);
    expect(done.partial).toBeUndefined();
    expect((await readGuideMeta(kv, "p9"))?.partial).toBeUndefined();
    // a complete guide is never overwritten by a draft
    const next = new GuideWriter(kv, "p9", 5000);
    next.add("g0", { start: now, stop: now + H, title: "Другое" });
    await next.flush();
    await next.keepDraft(new Map([["0", "g0"]]), new Map(), now, 7);
    expect((await readGuideMeta(kv, "p9"))?.gen).toBe(4000);
    // a draft whose download failed goes with it
    const kv2 = new MemoryKv();
    const f = new GuideWriter(kv2, "p8", 6000);
    f.add("g0", { start: now, stop: now + H, title: "x" });
    await f.flush();
    await f.keepDraft(new Map([["0", "g0"]]), new Map(), now, 7);
    await f.abort();
    expect(await readGuideMeta(kv2, "p8")).toBeNull();
  });
});
