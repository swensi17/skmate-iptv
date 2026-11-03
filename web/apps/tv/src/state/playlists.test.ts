import { describe, expect, it } from "vitest";
import { addPlaylist, canonicalMac, isStalker, nameFromUrl, nextActive, normalizeUrl, playlistFromSearch, removePlaylist, stalkerSource, updatePlaylist } from "./playlists";
import { channelKey, toggle } from "./favorites";
import { fetchPlaylist, looksLikeM3U, PlaylistError } from "./fetchPlaylist";

describe("playlist links", () => {
  it("adds a scheme and refuses what is not http(s)", () => {
    expect(normalizeUrl("example.com/list.m3u")).toBe("http://example.com/list.m3u");
    expect(normalizeUrl("https://a.b/c")).toBe("https://a.b/c");
    expect(normalizeUrl("ftp://a.b/c")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
  });
  it("names a playlist by host and file", () => {
    expect(nameFromUrl("https://iptv.example.com/kino.m3u")).toBe("iptv.example.com / kino");
    expect(nameFromUrl("https://iptv.example.com/get.php")).toBe("iptv.example.com");
  });
});

describe("Stalker portals", () => {
  // The MAC cases of the Android app's StalkerClientTest.
  it("takes a MAC in any spelling, letters past F too, and refuses a wrong length", () => {
    expect(canonicalMac("001a79aabbcc")).toBe("00:1A:79:AA:BB:CC");
    expect(canonicalMac("00-1A-79-AA-BB-CC")).toBe("00:1A:79:AA:BB:CC");
    expect(canonicalMac(" 00.1a.79.aa.bb.cc ")).toBe("00:1A:79:AA:BB:CC");
    expect(canonicalMac("00:1a:79:aa:bb:pq")).toBe("00:1A:79:AA:BB:PQ");
    for (const bad of ["001a79aabbc", "001a79aabbccdd", "001&79aabbcc", ""]) expect(canonicalMac(bad)).toBeNull();
  });
  it("saves a portal with its MAC and names it by the host", () => {
    const src = stalkerSource("portal.example:8080/c/", "001a79aabbcc");
    expect(src).toBe("stalker:http://portal.example:8080/c/#mac=00:1A:79:AA:BB:CC");
    expect(isStalker(src as string)).toBe(true);
    expect(nameFromUrl(src as string)).toBe("Stalker · portal.example");
    expect(stalkerSource("ftp://x/c/", "001a79aabbcc")).toBeNull();
    expect(stalkerSource("http://x/c/", "123")).toBeNull();
  });
});

describe("playlist list", () => {
  it("does not add the same link twice and numbers new ones", () => {
    const a = addPlaylist([], "http://a/1");
    const b = addPlaylist(a, "http://a/2", "Мой");
    expect(addPlaylist(b, "http://a/1")).toHaveLength(2);
    expect(b.map((p) => p.id)).toEqual(["1", "2"]);
    expect(b[1]?.name).toBe("Мой");
  });
  it("keeps the active playlist or falls back to the first", () => {
    const list = addPlaylist(addPlaylist([], "http://a/1"), "http://a/2");
    expect(nextActive(list, "2")).toBe("2");
    expect(nextActive(removePlaylist(list, "2"), "2")).toBe("1");
    expect(nextActive([], "1")).toBeNull();
  });
});

describe("favorites", () => {
  it("toggles and keys by tvg-id, else by name and link", () => {
    expect(channelKey({ id: "0", name: "A", url: "u", group: "", tvgId: "t" })).toBe("t");
    expect(channelKey({ id: "0", name: "A", url: "u", group: "" })).toBe("A|u");
    expect(channelKey({ id: "1", name: "B", url: "u", group: "" })).not.toBe(channelKey({ id: "0", name: "A", url: "u", group: "" }));
    const on = toggle(new Set(), "k");
    expect(on.has("k")).toBe(true);
    expect(toggle(on, "k").has("k")).toBe(false);
  });
});

describe("fetchPlaylist", () => {
  const ok = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch;
  it("returns a playlist", async () => {
    expect(await fetchPlaylist("http://x", ok("#EXTM3U\n#EXTINF:-1,A\nhttp://s"))).toContain("#EXTINF");
  });
  it("reports http errors, html pages and network failures", async () => {
    await expect(fetchPlaylist("http://x", ok("no", 404))).rejects.toMatchObject({ kind: "http" });
    await expect(fetchPlaylist("http://x", ok("<html>login</html>"))).rejects.toMatchObject({ kind: "invalid" });
    const down = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(fetchPlaylist("http://x", down)).rejects.toBeInstanceOf(PlaylistError);
    await expect(fetchPlaylist("http://x", down)).rejects.toMatchObject({ kind: "network" });
  });
  it("recognises m3u by its head", () => {
    expect(looksLikeM3U("﻿#EXTM3U")).toBe(true);
    expect(looksLikeM3U("<!doctype html>")).toBe(false);
  });
});

describe("playlistFromSearch", () => {
  it("reads an encoded link and refuses what is not http(s)", () => {
    expect(playlistFromSearch("?playlist=http%3A%2F%2Fa.b%2Fc.m3u8")).toBe("http://a.b/c.m3u8");
    expect(playlistFromSearch("?x=1&playlist=https://a.b/c")).toBe("https://a.b/c");
    expect(playlistFromSearch("?playlist=javascript:alert(1)")).toBeNull();
    expect(playlistFromSearch("?r=1")).toBeNull();
  });
});

describe("Xtream Codes", () => {
  it("turns a login into the provider's M3U link, keeping only the address and the port", async () => {
    const { xtreamUrl } = await import("./playlists");
    expect(xtreamUrl("tv.example.com:8080", "ivan", "s3cr t")).toBe("http://tv.example.com:8080/get.php?username=ivan&password=s3cr%20t&type=m3u_plus&output=m3u8");
    expect(xtreamUrl("https://tv.example.com/player_api.php", " ivan ", "p")).toBe("https://tv.example.com/get.php?username=ivan&password=p&type=m3u_plus&output=m3u8");
    expect(xtreamUrl("", "a", "b")).toBeNull();
    expect(xtreamUrl("ftp://x", "a", "b")).toBeNull();
    expect(xtreamUrl("http://x", "", "b")).toBeNull();
  });
  it("finds the guide of the same account", async () => {
    const { xtreamGuide } = await import("./playlists");
    expect(xtreamGuide("http://h:8080/get.php?username=a&password=b&type=m3u_plus")).toBe("http://h:8080/xmltv.php?username=a&password=b");
    expect(xtreamGuide("http://h/list.m3u")).toBeNull();
    expect(xtreamGuide("not a url")).toBeNull();
  });
});

describe("editing a playlist", () => {
  const list = addPlaylist(addPlaylist([], "http://a.example/x.m3u", "Первый"), "http://b.example/y.m3u", "Второй");
  it("changes the name and the link and keeps the id", () => {
    const out = updatePlaylist(list, "1", "Мой список", "http://c.example/z.m3u");
    expect(out?.[0]).toEqual({ id: "1", name: "Мой список", url: "http://c.example/z.m3u" });
    expect(out?.[1]).toEqual(list[1]);
  });
  it("names it after the link when the name is left empty", () => {
    expect(updatePlaylist(list, "1", "  ", "http://c.example/z.m3u")?.[0]?.name).toBe(nameFromUrl("http://c.example/z.m3u"));
  });
  it("refuses a link that is another playlist's, but accepts its own", () => {
    expect(updatePlaylist(list, "1", "Первый", "http://b.example/y.m3u")).toBeNull();
    expect(updatePlaylist(list, "1", "Новое имя", "http://a.example/x.m3u")?.[0]?.name).toBe("Новое имя");
  });
});
