/**
 * Load tests: the app under the sizes a real provider and a real guide bring. The time limits are far above what a
 * desktop needs and meant to catch a quadratic slip, not to measure a TV (a TV is several times slower: the figures
 * are printed so they can be compared).
 */
import { describe, expect, it } from "vitest";
import { gzipSync } from "fflate";
import { groupsOf, parseM3U, pickMirrors, SearchIndex, type Channel } from "@skmate/core";
import { GuideData, syncGuides, type EpgSource } from "@skmate/epg";
import { ChannelSearch } from "../state/channelSearch";
import { buildBackup, parseBackup, restoreBackup } from "../state/backup";
import { addPlaylist, nextActive, type PlaylistEntry } from "../state/playlists";
import { DEFAULTS } from "../state/settings";

const GROUPS = ["Новости", "Кино", "Спорт", "Музыка", "Детские", "Познавательные", "Развлекательные", "Региональные", "Футбол", "Фильмы 4K"];
const NAMES = ["Первый", "Россия", "НТВ", "Матч", "Кино ТВ", "Discovery", "National Geographic", "Eurosport", "Cartoon", "Спорт", "MTV", "Хит"];

function playlist(n: number, seed = 1): string {
  const out = ["#EXTM3U"];
  for (let i = 0; i < n; i++) {
    const name = `${NAMES[(i * seed) % NAMES.length]} ${(i % 97) + 1} ${i % 3 === 0 ? "HD" : i % 3 === 1 ? "FHD" : "SD"} ${i}`;
    out.push(`#EXTINF:-1 tvg-id="id${i}" tvg-name="${name}" tvg-logo="http://img/${i}.png" group-title="${GROUPS[i % GROUPS.length]}",${name}`);
    out.push(`http://stream.example/${seed}/${i}.m3u8`);
  }
  return out.join("\n");
}

const time = <T,>(label: string, f: () => T): { out: T; ms: number } => {
  const t0 = performance.now();
  const out = f();
  const ms = Math.round(performance.now() - t0);
  console.log(`[load] ${label}: ${ms} ms`);
  return { out, ms };
};

describe("channels under load", () => {
  const text = playlist(150_000);
  it("parses a 150 000-channel playlist, groups and searches it", () => {
    const parsed = time("parse 150k", () => parseM3U(text));
    expect(parsed.out).toHaveLength(150_000);
    expect(parsed.ms).toBeLessThan(15_000);
    const groups = time("groups", () => groupsOf(parsed.out));
    expect(groups.out).toHaveLength(GROUPS.length);
    const idx = time("build search index", () => new SearchIndex(parsed.out, (c) => c.name));
    const found = time("search 'discovry' (typo)", () => idx.out.search("discovry"));
    expect(found.out.length).toBeGreaterThan(0);
    expect(found.ms).toBeLessThan(5_000);
    const wrong = time("search wrong layout", () => idx.out.search("ghjkjh"));
    expect(wrong.ms).toBeLessThan(5_000);
    // typing a query letter by letter, as a viewer does
    const typing = time("type 'national' letter by letter", () => { for (let i = 1; i <= 8; i++) idx.out.search("national".slice(0, i)); });
    expect(typing.ms).toBeLessThan(10_000);
  }, 120_000);

  it("finds mirrors of a channel among 150 000: one index, then instant", () => {
    const ch = parseM3U(text);
    const first = time("first mirror lookup on 150k (builds the index)", () => pickMirrors(ch[5] as Channel, ch));
    expect(first.ms).toBeLessThan(3_000);
    const t = time("1000 more lookups", () => { for (let i = 0; i < 1000; i++) pickMirrors(ch[i * 7] as Channel, ch); });
    expect(t.ms).toBeLessThan(1_000);
  }, 120_000);
});

describe("several playlists", () => {
  it("keeps ten playlists, selects, removes, and survives a backup of all of it", () => {
    let list: PlaylistEntry[] = [];
    for (let i = 0; i < 10; i++) list = addPlaylist(list, `http://prov${i}.example/get.php?u=a${i}`);
    expect(list).toHaveLength(10);
    expect(addPlaylist(list, "http://prov3.example/get.php?u=a3")).toHaveLength(10);
    expect(nextActive(list.slice(1), list[0]?.id ?? null)).toBe(list[1]?.id);
    const store = new Map<string, string>();
    store.set("skmate.playlists.v1", JSON.stringify({ list, activeId: list[4]?.id }));
    store.set("skmate.settings.v1", JSON.stringify({ ...DEFAULTS, interests: ["Кино"] }));
    store.set("skmate.favorites.v1", JSON.stringify(Array.from({ length: 5000 }, (_, i) => `k${i}`)));
    store.set("skmate.cache.1", "x".repeat(3_000_000)); // a cache: not part of the backup
    const view = { get length() { return store.size; }, key: (i: number) => Array.from(store.keys())[i] ?? null, getItem: (k: string) => store.get(k) ?? null };
    const b = buildBackup(view, 1);
    expect(Object.keys(b.items)).not.toContain("skmate.cache.1");
    const back = parseBackup(JSON.stringify(b));
    expect(back).not.toBeNull();
    const fresh = new Map<string, string>();
    expect(restoreBackup(back as never, { setItem: (k, v) => void fresh.set(k, v) })).toBe(3);
    expect(JSON.parse(fresh.get("skmate.playlists.v1") as string).list).toHaveLength(10);
  });

  it("an old settings file from before an update gains the new fields and keeps the old values", () => {
    const old = { theme: "dark", engine: "hls", buffer: 60 };
    const merged = { ...DEFAULTS, ...old };
    expect(merged.theme).toBe("dark");
    expect(merged.autoUpdate).toBe(false);
    expect(merged.epgAuto).toBe(true);
  });
});

describe("the guide under load", () => {
  const now = Date.UTC(2026, 9, 31, 10, 30);
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:T]|\..*/g, "") + " +0000";
  const CHANNELS = 1500;
  const PER_DAY = 30;

  /** About 3000 channels for a week: the size of a large public guide. */
  function bigGuide(): string {
    const parts: string[] = ['<?xml version="1.0" encoding="UTF-8"?><tv>'];
    for (let c = 0; c < CHANNELS; c++) parts.push(`<channel id="g${c}"><display-name>Канал ${c} HD</display-name><icon src="http://img/g${c}.png"/></channel>`);
    for (let c = 0; c < CHANNELS; c++) {
      for (let d = -1; d < 7; d++) {
        const dayStart = Math.floor(now / 86_400_000) * 86_400_000 + d * 86_400_000;
        for (let p = 0; p < PER_DAY; p++) {
          const start = dayStart + p * 48 * 60_000;
          parts.push(`<programme start="${stamp(start)}" stop="${stamp(start + 48 * 60_000)}" channel="g${c}"><title>Передача ${p} &amp; ${c}</title><desc>Описание передачи номер ${p} канала ${c}, достаточно длинное, чтобы быть похожим на настоящее.</desc></programme>`);
        }
      }
    }
    parts.push("</tv>");
    return parts.join("");
  }

  it("reads a gzipped week-long guide in pieces, links 3000 channels, keeps the window, stays within the storage budget", async () => {
    const xml = bigGuide();
    console.log(`[load] guide: ${(xml.length / 1e6).toFixed(0)} MB of XML, ${CHANNELS * 8 * PER_DAY} programmes`);
    const gz = gzipSync(new TextEncoder().encode(xml));
    console.log(`[load] gzip: ${(gz.length / 1e6).toFixed(1)} MB`);
    const channels: Channel[] = Array.from({ length: CHANNELS }, (_, i) => ({ id: String(i), name: `Канал ${i} UHD`, url: `http://s/${i}`, group: "", tvgId: i % 2 === 0 ? `g${i}` : undefined }));
    // The body arrives in 64 KB pieces, as it does from a network.
    const stream = () => new ReadableStream<Uint8Array>({
      start(ctl) { for (let i = 0; i < gz.length; i += 65_536) ctl.enqueue(gz.slice(i, i + 65_536)); ctl.close(); },
    });
    const source: EpgSource = { id: "1", name: "Большой", url: "http://guide/big.xml.gz" };
    // How long the screen would have been held at a stretch: a timer that should fire every 5 ms shows its gaps.
    let longest = 0;
    let last = performance.now();
    const probe = setInterval(() => { const n = performance.now(); longest = Math.max(longest, n - last); last = n; }, 5);
    const t0 = performance.now();
    const { data, outcomes } = await syncGuides({
      sources: [source], channels, now,
      open: async () => new Response(stream()),
      onProgress: () => undefined,
    });
    const ms = Math.round(performance.now() - t0);
    console.log(`[load] sync: ${ms} ms, linked ${data.linked}, kept ${data.programmeCount} programmes`);
    clearInterval(probe);
    console.log(`[load] longest stretch without a free moment: ${Math.round(longest)} ms`);
    expect(longest).toBeLessThan(1_500);
    expect(outcomes[0]).toMatchObject({ ok: true });
    expect(data.linked).toBe(CHANNELS);
    // only the window around "now" is kept: 1 h back and 12 h ahead, about 16 of 48-minute programmes per channel
    expect(data.programmeCount).toBeLessThan(CHANNELS * 25);
    expect(data.nowNext("10", now).now?.title).toContain("Передача");
    const saved = time("serialize", () => data.serialize(now));
    expect(saved.out.length).toBeLessThanOrEqual(4_300_000); // localStorage's budget
    const restored = time("restore", () => GuideData.restore(saved.out));
    expect(restored.out.linked).toBeGreaterThan(0);
    expect(restored.out.nowNext("10", now).now).not.toBeNull();
    expect(ms).toBeLessThan(120_000);
  }, 300_000);

  it("answers a screenful of rows at once, and a programme search over 3000 channels", () => {
    const data = new GuideData();
    const channels: Channel[] = [];
    for (let i = 0; i < CHANNELS; i++) {
      channels.push({ id: String(i), name: `Канал ${i}`, url: "u", group: "" });
      data.links.set(String(i), `g${i}`);
      data.programmes.set(`g${i}`, Array.from({ length: 16 }, (_, p) => ({ start: now - 3_600_000 + p * 2_880_000, stop: now - 3_600_000 + (p + 1) * 2_880_000, title: p % 5 === 1 ? `Футбол ${p}` : `Фильм ${p}` })));
    }
    const rows = time("20 000 nowNext lookups (a long list scrolled)", () => { for (let i = 0; i < 20_000; i++) data.nowNext(String(i % CHANNELS), now); });
    expect(rows.ms).toBeLessThan(5_000);
    const search = time("build channel search over names and now-playing", () => new ChannelSearch(channels, data, now));
    const hits = time("search 'футбол'", () => search.out.search("футбол"));
    expect(hits.out.length).toBeGreaterThan(0);
    expect(hits.ms).toBeLessThan(5_000);
  }, 60_000);

  it("survives a broken guide: cut off in the middle, not gzip, empty, garbage", async () => {
    const channels: Channel[] = [{ id: "1", name: "Первый", url: "u", group: "" }];
    const ok = `<tv><channel id="a"><display-name>Первый</display-name></channel><programme start="${stamp(now)}" stop="${stamp(now + 3_600_000)}" channel="a"><title>Т</title></programme></tv>`;
    const cases: Array<[string, () => Response]> = [
      ["cut", () => new Response(ok.slice(0, ok.length - 40))],
      ["empty", () => new Response("")],
      ["garbage", () => new Response(new Uint8Array([0x1f, 0x8b, 1, 2, 3, 4]))],
      ["html", () => new Response("<html><body>blocked</body></html>")],
      ["500", () => new Response("no", { status: 500 })],
    ];
    for (const [name, make] of cases) {
      const { outcomes } = await syncGuides({ sources: [{ id: "1", name, url: "http://x/g.xml" }], channels, now, open: async () => make() });
      expect(outcomes).toHaveLength(1); // never throws, always reports
    }
  });
});
