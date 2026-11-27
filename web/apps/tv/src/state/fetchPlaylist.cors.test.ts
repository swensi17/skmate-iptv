import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlaylist, PlaylistError } from "./fetchPlaylist";

// The tests run in Node: a page-like location makes the "no-cors" probe apply.
const g = globalThis as unknown as { location?: { protocol: string } };

describe("fetchPlaylist: a server that refuses browsers", () => {
  afterEach(() => { delete g.location; });

  it("says cors when a plain request fails but a no-cors one gets through", async () => {
    g.location = { protocol: "https:" };
    const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.mode === "no-cors") return new Response("");
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(fetchPlaylist("https://example.com/a.m3u8", fetchFn)).rejects.toMatchObject({ kind: "cors" });
  });

  it("says network when even the no-cors request fails (the server is not there)", async () => {
    g.location = { protocol: "https:" };
    const fetchFn = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(fetchPlaylist("https://example.com/a.m3u8", fetchFn)).rejects.toMatchObject({ kind: "network" });
  });

  it("does not probe in a packaged app (file:), where the page can read any server", async () => {
    g.location = { protocol: "file:" };
    const fetchFn = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(fetchPlaylist("https://example.com/a.m3u8", fetchFn)).rejects.toBeInstanceOf(PlaylistError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("fetchPlaylist: the proxy fallback", () => {
  afterEach(() => { delete g.location; });
  const PROXY = "https://p.example.workers.dev";
  const blocked = (via: (u: string) => Response | Promise<Response>, calls: string[] = []) => vi.fn(async (u: string, init?: RequestInit) => {
    calls.push(u);
    if (u.startsWith(PROXY)) return via(u);
    if (init?.mode === "no-cors") return new Response("");
    throw new TypeError("Failed to fetch");
  }) as unknown as typeof fetch;

  it("goes through the proxy only after the direct request was refused", async () => {
    g.location = { protocol: "http:" };
    const calls: string[] = [];
    const text = await fetchPlaylist("http://x.tv/a.m3u8?t=1", blocked(() => new Response("#EXTM3U\n#EXTINF:-1,A\nhttp://s/1"), calls), 5000, PROXY);
    expect(text).toContain("#EXTM3U");
    expect(calls[0]).toBe("http://x.tv/a.m3u8?t=1");
    expect(calls[calls.length - 1]).toBe(`${PROXY}?url=${encodeURIComponent("http://x.tv/a.m3u8?t=1")}`);
  });

  it("does not use the proxy when the direct request works", async () => {
    g.location = { protocol: "http:" };
    const fetchFn = vi.fn(async () => new Response("#EXTM3U\n")) as unknown as typeof fetch;
    await fetchPlaylist("http://x.tv/a.m3u8", fetchFn, 5000, PROXY);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("never uses it in a packaged app, nor without an address, nor for a dead server", async () => {
    g.location = { protocol: "file:" };
    await expect(fetchPlaylist("http://x.tv/a.m3u8", blocked(() => new Response("#EXTM3U")), 5000, PROXY)).rejects.toBeInstanceOf(PlaylistError);
    g.location = { protocol: "http:" };
    await expect(fetchPlaylist("http://x.tv/a.m3u8", blocked(() => new Response("#EXTM3U")), 5000, "")).rejects.toMatchObject({ kind: "cors" });
    const dead = vi.fn(async () => { throw new TypeError("x"); }) as unknown as typeof fetch;
    await expect(fetchPlaylist("http://x.tv/a.m3u8", dead, 5000, PROXY)).rejects.toMatchObject({ kind: "network" });
  });

  it("keeps saying cors when the proxy fails too", async () => {
    g.location = { protocol: "http:" };
    await expect(fetchPlaylist("http://x.tv/a.m3u8", blocked(() => new Response("no", { status: 502 })), 5000, PROXY)).rejects.toMatchObject({ kind: "cors" });
  });
});
