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
    expect(ch[0]).toMatchObject({ id: "0", name: "Первый канал, HD", url: "http://host/1.m3u8", group: "Новости", tvgId: "perviy", logo: "http://x/1.png" });
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
});
