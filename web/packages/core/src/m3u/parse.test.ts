import { describe, expect, it } from "vitest";
import { groupsOf, parseM3U } from "./parse";

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
