import { describe, expect, it } from "vitest";
import { isLocal, localUrl, readPlaylistFile } from "./localFiles";

describe("playlist from a file", () => {
  it("takes the name from the file and checks it holds channels", () => {
    expect(readPlaylistFile("Мой ТВ.m3u8", "#EXTM3U\n#EXTINF:-1,Первый\nhttp://a/1.m3u8")).toEqual({ name: "Мой ТВ", ok: true });
    expect(readPlaylistFile("list.M3U", "#EXTM3U\n")).toEqual({ name: "list", ok: false });
    expect(readPlaylistFile("notes.txt", "hello").ok).toBe(false);
  });
  it("gives each file its own local address, never a network one", () => {
    const a = localUrl(1_000, 0.1);
    expect(isLocal(a)).toBe(true);
    expect(a).not.toBe(localUrl(1_000, 0.2));
    expect(isLocal("http://x/list.m3u")).toBe(false);
  });
});
