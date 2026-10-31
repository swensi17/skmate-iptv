import { describe, expect, it } from "vitest";
import { addPlaylist, nameFromUrl, nextActive, normalizeUrl, playlistFromSearch, removePlaylist } from "./playlists";
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
