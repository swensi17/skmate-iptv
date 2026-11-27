import { describe, expect, it } from "vitest";
import { groupsOf, guidesInHeader, parseM3U } from "./parse";

const SAMPLE = `﻿#EXTM3U\r
#EXTINF:-1 tvg-id="perviy" tvg-logo="http://x/1.png" group-title="Новости",Первый канал, HD
#EXTVLCOPT:http-user-agent=SkMate
http://host/1.m3u8
#EXTINF:-1 tvg-name="Кино ТВ",Кино ТВ
#EXTGRP:Кино
http://host/2.ts
#EXTINF:-1,
http://host/3
# a comment
#EXTINF:-1 group-title="Без урла",Orphan
`;

describe("parseM3U", () => {
  const ch = parseM3U(SAMPLE);
  it("reads names, urls, groups and attributes", () => {
    expect(ch).toHaveLength(3);
    expect(ch[0]).toMatchObject({ name: "Первый канал, HD", url: "http://host/1.m3u8", group: "Новости", tvgId: "perviy", logo: "http://x/1.png" });
  });
  it("keeps player headers", () => {
    expect(ch[0]?.headers).toEqual({ "User-Agent": "SkMate" });
  });
  it("takes the group from #EXTGRP", () => {
    expect(ch[1]?.group).toBe("Кино");
  });
  it("falls back to the url when a name is missing and drops entries without one", () => {
    expect(ch[2]?.name).toBe("http://host/3");
  });
  it("groups in playlist order", () => {
    expect(groupsOf(ch).map((g) => g.name)).toEqual(["Новости", "Кино", ""]);
  });
});

describe("guidesInHeader", () => {
  it("reads every guide the header names", () => {
    expect(guidesInHeader('#EXTM3U url-tvg="http://a/x.xml, http://b/y.xml.gz" x-tvg-url="http://c/z.xml"\n#EXTINF:-1,A')).toEqual([
      "http://a/x.xml", "http://b/y.xml.gz", "http://c/z.xml",
    ]);
  });
  it("is empty without a header guide", () => {
    expect(guidesInHeader("#EXTM3U\n#EXTINF:-1,A")).toEqual([]);
    expect(guidesInHeader("\uFEFF#EXTM3U url-tvg=\"ftp://x\"")).toEqual([]);
  });
});

describe("catch-up days", () => {
  it("reads the archive depth a provider declares", () => {
    const ch = parseM3U('#EXTM3U\n#EXTINF:0 tvg-rec="3",A\nhttp://a\n#EXTINF:0 tvg-rec="0",B\nhttp://b\n#EXTINF:-1 catchup-days="7",C\nhttp://c\n#EXTINF:-1,D\nhttp://d');
    expect(ch.map((c) => c.catchupDays)).toEqual([3, undefined, 7, undefined]);
  });

  it("reads the archive type, template and correction as the Android app does", () => {
    const ch = parseM3U([
      '#EXTM3U catchup-correction="-1"',
      '#EXTINF:-1 catchup="append" catchup-days="5" catchup-source="?utc={utc}",A', "http://a",
      '#EXTINF:-1 timeshift="2",B', "http://b",
      '#EXTINF:-1 catchup="flussonic" timeshift="2" catchup-correction="1.5",C', "http://c",
      "#EXTINF:-1,D", "http://d",
    ].join("\n"));
    expect(ch.map((c) => [c.catchupType, c.catchupSource, c.catchupDays, c.catchupCorrectionMin])).toEqual([
      ["append", "?utc={utc}", 5, -60],
      ["shift", undefined, 2, -60],
      ["flussonic", undefined, undefined, 90],
      [undefined, undefined, undefined, -60],
    ]);
  });
});

describe("channel ids (2.6.9)", () => {
  const line = (name: string, tvg = "") => `#EXTINF:-1${tvg ? ` tvg-id="${tvg}"` : ""},${name}\nhttp://h/${encodeURIComponent(name)}`;
  it("stay the same when a channel is added before them, and copies are told apart", () => {
    const before = parseM3U(["#EXTM3U", line("Первый канал HD", "1tv"), line("Первый канал HD orig", "1tv"), line("НТВ")].join("\n"));
    const after = parseM3U(["#EXTM3U", line("Новый"), line("Первый канал HD", "1tv"), line("Первый канал HD orig", "1tv"), line("НТВ")].join("\n"));
    const idOf = (list: typeof before, name: string) => list.find((c) => c.name === name)?.id;
    for (const n of ["Первый канал HD", "Первый канал HD orig", "НТВ"]) expect(idOf(after, n)).toBe(idOf(before, n));
    expect(new Set(after.map((c) => c.id)).size).toBe(after.length);
    const twins = parseM3U(["#EXTM3U", line("A"), line("A")].join("\n"));
    expect(twins[0]?.id).not.toBe(twins[1]?.id);
  });
});
