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
