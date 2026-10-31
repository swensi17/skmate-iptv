import { describe, expect, it } from "vitest";
import { gzipSync } from "fflate";
import type { Channel } from "@skmate/core";
import { GuideData, GuideIndex, guidesForPlaylist, normalizeForEpg, parseXmltvTime, scoreNormalized, syncGuides, XmltvScanner, type EpgSource } from "./index";

const ch = (id: string, name: string, extra: Partial<Channel> = {}): Channel => ({ id, name, url: `http://s/${id}`, group: "", ...extra });

describe("normalizeForEpg (as the Android EpgMatcher)", () => {
  it("drops quality tags, brackets and separators", () => {
    expect(normalizeForEpg("DE| FUSS-TV 3 [HD]")).toBe("fuss tv 3");
    expect(normalizeForEpg("Первый канал HD")).toBe("первый канал");
    expect(normalizeForEpg("BBC One")).toBe("bbc 1");
  });
  it("keeps a country that is the name, drops a country tag", () => {
    expect(normalizeForEpg("France 24")).toBe("france 24");
    expect(normalizeForEpg("MTV UK")).toBe("mtv");
  });
});

describe("scoreNormalized", () => {
  it("never matches different channel numbers", () => {
    expect(scoreNormalized("sky sports 2", "sky sports 3")).toBeLessThan(0.74);
  });
  it("keeps a number on one side below auto-apply", () => {
    expect(scoreNormalized("mtv", "mtv 2")).toBeLessThan(0.92);
  });
  it("is high for the same name with a typo", () => {
    expect(scoreNormalized("discovery channel", "discovry channel")).toBeGreaterThan(0.92);
  });
});

describe("GuideIndex", () => {
  const guide = [
    { id: "perviy.ru", name: "Первый канал" },
    { id: "ntv.ru", name: "НТВ" },
    { id: "mtv2", name: "MTV 2" },
    { id: "mtv3", name: "MTV 3" },
  ];
  const index = new GuideIndex(guide);
  it("finds a channel by its name through the tags", () => {
    expect(index.best("Первый канал UHD")?.id).toBe("perviy.ru");
    expect(index.best("НТВ HD")?.id).toBe("ntv.ru");
  });
  it("does not mix channels that differ in number", () => {
    expect(index.best("MTV 2 HD")?.id).toBe("mtv2");
    expect(index.best("MTV 4")).toBeNull();
  });
  it("finds nothing for an unknown channel", () => {
    expect(index.best("Совсем другой канал")).toBeNull();
  });
});

describe("XMLTV", () => {
  it("reads times with and without an offset", () => {
    expect(parseXmltvTime("20261031053000 +0300")).toBe(Date.UTC(2026, 9, 31, 2, 30, 0));
    expect(parseXmltvTime("20261031053000")).toBe(Date.UTC(2026, 9, 31, 5, 30, 0));
    expect(parseXmltvTime("junk")).toBeNull();
  });

  const xml = `<?xml version="1.0"?><tv><channel id="a"><display-name>Канал &amp; Ко</display-name><display-name>A HD</display-name></channel>
<programme start="20261031100000 +0000" stop="20261031110000 +0000" channel="a"><title lang="ru">Новости &quot;дня&quot;</title><desc>О <![CDATA[важном]]></desc></programme></tv>`;

  it("reads channels and programmes", () => {
    const channels: string[][] = [];
    const progs: Array<[string, string, string | undefined]> = [];
    const s = new XmltvScanner({ onChannel: (c) => channels.push(c.names), onProgramme: (id, p) => progs.push([id, p.title, p.desc]) });
    s.feed(xml);
    expect(channels).toEqual([["Канал & Ко", "A HD"]]);
    expect(progs).toEqual([["a", 'Новости "дня"', "О важном"]]);
  });

  it("gives the same result however the text is cut into chunks", () => {
    const got: string[] = [];
    const s = new XmltvScanner({ onChannel: (c) => got.push(`c:${c.id}`), onProgramme: (id, p) => got.push(`p:${id}:${p.title}`) });
    for (let i = 0; i < xml.length; i += 7) s.feed(xml.slice(i, i + 7));
    expect(got).toEqual(["c:a", 'p:a:Новости "дня"']);
  });
});

describe("guidesForPlaylist", () => {
  it("prefers the playlist's own guide, then adds the shared ones", () => {
    const g = guidesForPlaylist("Мой", "http://x.y/p.m3u", ["http://own/guide.xml"]);
    expect(g[0]?.url).toBe("http://own/guide.xml");
    expect(g.length).toBeGreaterThan(1);
  });
  it("falls back to the provider's guide by host, and never repeats", () => {
    const g = guidesForPlaylist("Мой", "http://tv.team/list.m3u", []);
    expect(g[0]?.url).toBe("http://epg.team/tvteam.xml");
    expect(new Set(g.map((x) => x.url)).size).toBe(g.length);
  });
});

describe("GuideData", () => {
  const now = Date.UTC(2026, 9, 31, 10, 30);
  const data = new GuideData(new Map([["1", "a"]]), new Map([["a", [
    { start: now - 3_600_000, stop: now - 1_800_000, title: "Было" },
    { start: now - 1_800_000, stop: now + 1_800_000, title: "Идёт" },
    { start: now + 1_800_000, stop: now + 5_400_000, title: "Дальше" },
  ]]]), now);
  it("finds what is on and what is next, with progress", () => {
    const n = data.nowNext("1", now);
    expect(n.now?.title).toBe("Идёт");
    expect(n.next?.title).toBe("Дальше");
    expect(n.progress).toBeCloseTo(0.5, 2);
    expect(data.nowNext("2", now).now).toBeNull();
  });
  it("survives a round trip and a damaged cache", () => {
    const back = GuideData.restore(data.serialize());
    expect(back.nowNext("1", now).now?.title).toBe("Идёт");
    expect(GuideData.restore("{broken").linked).toBe(0);
  });
});

describe("syncGuides", () => {
  const now = Date.UTC(2026, 9, 31, 10, 30);
  const xml = (rows: string) => `<tv><channel id="perviy"><display-name>Первый канал</display-name></channel><channel id="ntv"><display-name>НТВ</display-name></channel>${rows}</tv>`;
  const prog = (id: string, from: number, to: number, title: string) =>
    `<programme start="${new Date(from).toISOString().replace(/[-:T]|\..*/g, "")} +0000" stop="${new Date(to).toISOString().replace(/[-:T]|\..*/g, "")} +0000" channel="${id}"><title>${title}</title></programme>`;
  const body = xml(prog("perviy", now - 1_800_000, now + 1_800_000, "Новости") + prog("ntv", now, now + 3_600_000, "Утро") + prog("other", now, now + 60_000, "Чужое"));
  const source: EpgSource = { id: "1", name: "Тест", url: "http://guide/a.xml.gz" };
  const channels = [ch("1", "Первый канал UHD"), ch("2", "НТВ HD", { tvgId: "NTV" }), ch("3", "Неизвестный")];

  it("links by name and by tvg-id, keeps only linked programmes, reads gzip", async () => {
    const gz = gzipSync(new TextEncoder().encode(body));
    const { data, outcomes } = await syncGuides({
      sources: [source], channels, now,
      open: async () => new Response(gz),
    });
    expect(outcomes[0]).toMatchObject({ ok: true, linked: 2, programmes: 2 });
    expect(data.links.get("1")).toBe("perviy");
    expect(data.links.get("2")).toBe("ntv");
    expect(data.links.has("3")).toBe(false);
    expect(data.nowNext("1", now).now?.title).toBe("Новости");
    expect(data.programmes.has("other")).toBe(false);
  });

  it("reports a failing source and goes on to the next", async () => {
    const { data, outcomes } = await syncGuides({
      sources: [source, { ...source, id: "2", url: "http://guide/b.xml" }], channels, now,
      open: async (url) => (url.endsWith(".gz") ? Promise.reject(new TypeError("Failed to fetch")) : new Response(body)),
    });
    expect(outcomes[0]).toMatchObject({ ok: false });
    expect(outcomes[1]).toMatchObject({ ok: true, linked: 2 });
    expect(data.linked).toBe(2);
  });

  it("stops reading sources once every channel is linked", async () => {
    let opened = 0;
    await syncGuides({
      sources: [source, { ...source, id: "2", url: "http://guide/b.xml" }], channels: [ch("1", "Первый канал")], now,
      open: async () => { opened++; return new Response(body); },
    });
    expect(opened).toBe(1);
  });
});
