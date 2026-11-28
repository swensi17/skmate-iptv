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

  it("reads a channel's logo", () => {
    let icon: string | undefined;
    new XmltvScanner({ onChannel: (c) => { icon = c.icon; }, onProgramme: () => undefined })
      .feed('<channel id="a"><display-name>A</display-name><icon src="http://x/a.png?x=1&amp;y=2" /></channel>');
    expect(icon).toBe("http://x/a.png?x=1&y=2");
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

  it("brings the guide's logos for the channels it linked", async () => {
    const withIcons = body.replace("<display-name>Первый канал</display-name>", '<display-name>Первый канал</display-name><icon src="http://img/1.png"/>');
    const { data } = await syncGuides({ sources: [source], channels, now, open: async () => new Response(withIcons) });
    expect(data.logoOf("1")).toBe("http://img/1.png");
    expect(data.logoOf("3")).toBeUndefined();
    expect(GuideData.restore(data.serialize(now)).logoOf("1")).toBe("http://img/1.png");
  });

  it("says when channels are linked, before their programmes are in (a first guide fills in, 2.5.2)", async () => {
    const seen: Array<[number, number]> = [];
    const { data } = await syncGuides({
      sources: [source], channels, now, open: async () => new Response(body),
      onLinked: (sofar) => { seen.push([sofar.linked, sofar.programmeCount]); },
    });
    expect(seen).toEqual([[2, 0]]);
    expect(data.programmeCount).toBeGreaterThan(0);
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

describe("GuideData at the junction of programmes (android 2.6.1)", () => {
  it("shows the next programme as current the moment the previous one ends", () => {
    const data = new GuideData(new Map([["1", "a"]]), new Map([["a", [
      { start: 0, stop: 1000, title: "first" },
      { start: 1000, stop: 2000, title: "second" },
      { start: 2000, stop: 3000, title: "third" },
    ]]]));
    expect(data.nowNext("1", 999).now?.title).toBe("first");
    const at = data.nowNext("1", 1000);
    expect(at.now?.title).toBe("second");
    expect(at.next?.title).toBe("third");
  });
});

describe("syncGuides: the exact name first (2.6.4)", () => {
  const now = Date.UTC(2026, 10, 27, 10, 30);
  const at = (ms: number) => `${new Date(ms).toISOString().replace(/[-:T]|\..*/g, "")} +0000`;
  const guide = (id: string, name: string, title: string) =>
    `<tv><channel id="${id}"><display-name>${name}</display-name></channel><programme start="${at(now - 600_000)}" stop="${at(now + 600_000)}" channel="${id}"><title>${title}</title></programme></tv>`;
  it("a later guide with the exact name takes over a link made by likeness", async () => {
    const it999 = guide("tnt4.it", "ТНТ4", "Камеди Клаб");
    const team = guide("tnt4hd.team", "ТНТ4 HD", "Интерны");
    const { data } = await syncGuides({
      sources: [{ id: "a", name: "it999", url: "http://a" }, { id: "b", name: "team", url: "http://b" }],
      channels: [ch("1", "ТНТ4 HD"), ch("2", "ТНТ4")], now,
      open: async (url) => new Response(url === "http://a" ? it999 : team),
    });
    expect(data.links.get("1")).toBe("tnt4hd.team");
    expect(data.nowNext("1", now).now?.title).toBe("Интерны");
    expect(data.links.get("2")).toBe("tnt4.it");
  });
});

describe("syncGuides: one guide per channel (2.6.6)", () => {
  const now = Date.UTC(2026, 10, 27, 12, 0);
  const at = (ms: number) => `${new Date(ms).toISOString().replace(/[-:T]|\..*/g, "")} +0000`;
  const prog = (id: string, a: number, b: number, t: string) => `<programme start="${at(a)}" stop="${at(b)}" channel="${id}"><title>${t}</title></programme>`;
  const guide = (id: string, name: string, rows: string) => `<tv><channel id="${id}"><display-name>${name}</display-name></channel>${rows}</tv>`;
  const run = (bodies: string[], channels: Channel[]) => syncGuides({
    sources: bodies.map((_, i) => ({ id: String(i), name: `g${i}`, url: `http://g/${i}` })), channels, now,
    open: async (url) => new Response(bodies[Number(url.slice(-1))] as string),
  });

  it("a tvg-id in a guide below beats a name match in the guide above", async () => {
    const { data } = await run([
      guide("other", "Матч ТВ", prog("other", now - 600_000, now + 600_000, "Не то")),
      guide("m1", "Matchbox", prog("m1", now - 600_000, now + 600_000, "То")),
    ], [ch("1", "Матч ТВ", { tvgId: "m1" })]);
    expect(data.links.get("1")).toBe("m1");
    expect(data.nowNext("1", now).now?.title).toBe("То");
  });

  it("the guide above with nothing now or ahead gives the channel to the one below, whole", async () => {
    const { data } = await run([
      guide("a", "Канал", prog("a", now - 7_200_000, now - 3_600_000, "Старое")),
      guide("b", "Канал", prog("b", now - 600_000, now + 600_000, "Сейчас")),
    ], [ch("1", "Канал")]);
    expect(data.links.get("1")).toBe("b");
    expect(data.of("1").map((p) => p.title)).toEqual(["Сейчас"]);
  });

  it("the guide above with something ahead keeps the channel; the one below never fills its gaps", async () => {
    const { data } = await run([
      guide("a", "Канал", prog("a", now + 3_600_000, now + 7_200_000, "Вечером")),
      guide("b", "Канал", prog("b", now - 600_000, now + 600_000, "Сейчас")),
    ], [ch("1", "Канал")]);
    expect(data.links.get("1")).toBe("a");
    expect(data.of("1").map((p) => p.title)).toEqual(["Вечером"]);
  });
});

describe("syncGuides: the past only where there is an archive (2.7.0)", () => {
  const now = Date.UTC(2026, 10, 28, 12, 0);
  const at = (ms: number) => `${new Date(ms).toISOString().replace(/[-:T]|\..*/g, "")} +0000`;
  const prog = (id: string, a: number, b: number, t: string) => `<programme start="${at(a)}" stop="${at(b)}" channel="${id}"><title>${t}</title></programme>`;
  const day = 86_400_000;
  const xml = `<tv><channel id="a"><display-name>Архивный</display-name></channel><channel id="b"><display-name>Простой</display-name></channel>${
    prog("a", now - 2 * day, now - 2 * day + 3_600_000, "Позавчера") + prog("a", now - 600_000, now + 600_000, "Сейчас А")
    + prog("b", now - 2 * day, now - 2 * day + 3_600_000, "Позавчера Б") + prog("b", now - 600_000, now + 600_000, "Сейчас Б")}</tv>`;
  it("keeps aired days for a channel with an archive, a few hours for the rest", async () => {
    const { data } = await syncGuides({
      sources: [{ id: "1", name: "g", url: "http://g" }], now, open: async () => new Response(xml),
      channels: [ch("1", "Архивный", { catchupDays: 3 }), ch("2", "Простой")],
      pastMs: 7 * day, aheadMs: day, pastFor: (c) => (c.catchupDays ?? 0) * day, shortPastMs: 6 * 3_600_000,
    });
    expect(data.of("1").map((p) => p.title)).toEqual(["Позавчера", "Сейчас А"]);
    expect(data.of("2").map((p) => p.title)).toEqual(["Сейчас Б"]);
  });
});

describe("pictographs out of the guide (#924)", () => {
  it("drops a skier and a ball before the title, keeps the words", async () => {
    const { noPictographs } = await import("./xmltv");
    expect(noPictographs("⛷ Кубок мира 🏂 Сноуборд")).toBe("Кубок мира Сноуборд");
    expect(noPictographs("⚽️ Футбол")).toBe("Футбол");
    expect(noPictographs("Новости")).toBe("Новости");
    expect(noPictographs("► Alpine Skiing Кубок мира")).toBe("Alpine Skiing Кубок мира"); // #948: an arrow
    expect(noPictographs("▶ Снукер")).toBe("Снукер");
    expect(noPictographs("\uE01B Снукер")).toBe("Снукер");
    for (let i = 0; i < 3; i++) expect(noPictographs("🏒 Хоккей")).toBe("Хоккей"); // no state between calls
    expect(noPictographs("Что? Где? Когда? (с.3) — №1")).toBe("Что? Где? Когда? (с.3) — №1");
  });
});

describe("the live arrow (#950)", () => {
  it("becomes the live mark, the text stays clean", async () => {
    const { noPictographs, liveTitle, LIVE_MARK } = await import("./xmltv");
    expect(liveTitle(LIVE_MARK + "Alpine Skiing")).toEqual({ live: true, text: "Alpine Skiing" });
    expect(liveTitle("Новости")).toEqual({ live: false, text: "Новости" });
    expect(noPictographs(LIVE_MARK + "Снукер")).toBe(LIVE_MARK + "Снукер");
  });
});

describe("a live arrow in the guide itself (#950)", () => {
  it("reads ► Title as a live title without the arrow", () => {
    const titles: string[] = [];
    new XmltvScanner({ onChannel: () => undefined, onProgramme: (_id, p) => titles.push(p.title) })
      .feed('<programme start="20261128100000 +0000" stop="20261128110000 +0000" channel="a"><title>► Alpine Skiing</title></programme><programme start="20261128110000 +0000" stop="20261128120000 +0000" channel="a"><title>Новости</title></programme>');
    expect(titles).toEqual(["⁣Alpine Skiing", "Новости"]);
  });
});
