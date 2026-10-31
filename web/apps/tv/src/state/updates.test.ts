import { describe, expect, it, vi } from "vitest";
import { alreadyTried, compareVersions, fetchRelease, install, isUpdate, parseRelease, releaseUrl } from "./updates";

describe("versions", () => {
  it("compares number by number", () => {
    expect(compareVersions("2.10.0", "2.9.9")).toBe(1);
    expect(compareVersions("2.0", "2.0.0")).toBe(0);
    expect(compareVersions("1.9.9", "2.0.0")).toBe(-1);
    expect(compareVersions("2.0.0-beta", "2.0.0")).toBe(0);
  });
  it("a later version, or the same one rebuilt later, is an update; never an older one", () => {
    const run = { version: "2.0.0", build: 1000 };
    expect(isUpdate({ version: "2.1.0", build: 1 }, run)).toBe(true);
    expect(isUpdate({ version: "2.0.0", build: 2000 }, run)).toBe(true);
    expect(isUpdate({ version: "2.0.0", build: 1000 }, run)).toBe(false);
    expect(isUpdate({ version: "1.9.0", build: 9999 }, run)).toBe(false);
  });
});

describe("parseRelease", () => {
  it("reads a release, cuts long notes", () => {
    expect(parseRelease('{"version":"2.1.0","build":5}')).toEqual({ version: "2.1.0", build: 5, notes: undefined });
    expect(parseRelease(JSON.stringify({ version: "2.1.0", build: 5, notes: "x".repeat(2000) }))?.notes?.length).toBe(600);
  });
  it("is null for anything else: a page, a broken file, wrong types", () => {
    expect(parseRelease("<html>index</html>")).toBeNull();
    expect(parseRelease('{"version":2,"build":1}')).toBeNull();
    expect(parseRelease('{"version":"abc","build":1}')).toBeNull();
    expect(parseRelease('{"version":"1.0.0","build":"x"}')).toBeNull();
    expect(parseRelease("null")).toBeNull();
  });
});

describe("fetchRelease", () => {
  it("returns the release, and null when the server fails, answers a page or is not reachable", async () => {
    const ok = vi.fn(async (_u: string, _i?: RequestInit) => new Response('{"version":"3.0.0","build":7}'));
    expect((await fetchRelease("http://x/version.json", ok as never))?.version).toBe("3.0.0");
    expect(ok.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
    expect(await fetchRelease("http://x", (async () => new Response("nope", { status: 404 })) as never)).toBeNull();
    expect(await fetchRelease("http://x", (async () => new Response("<html></html>")) as never)).toBeNull();
    expect(await fetchRelease("http://x", (async () => { throw new TypeError("offline"); }) as never)).toBeNull();
  });
  it("gives up on a server that never answers", async () => {
    const hang = ((_: string, init?: RequestInit) => new Promise((_res, rej) => { init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))); })) as never;
    expect(await fetchRelease("http://x", hang, 20)).toBeNull();
  });
});

describe("install", () => {
  it("clears caches and workers, remembers the build and loads the page under a new address", async () => {
    const deleted: string[] = [];
    const unregistered: number[] = [];
    const store = new Map<string, string>();
    const go = vi.fn();
    await install({ version: "2.1.0", build: 42 }, {
      caches: { keys: async () => ["a", "b"], delete: async (k: string) => { deleted.push(k); return true; } } as never,
      workers: { getRegistrations: async () => [{ unregister: async () => { unregistered.push(1); return true; } }] } as never,
      session: { setItem: (k, v) => void store.set(k, v) }, go, here: "http://tv.local/app/index.html?x=1#/live",
    });
    expect(deleted).toEqual(["a", "b"]);
    expect(unregistered).toHaveLength(1);
    expect(store.get("skmate.update.tried")).toBe("42");
    expect(go).toHaveBeenCalledWith("http://tv.local/app/index.html?x=1&v=42#/live");
  });
  it("still reloads when caches and storage are unavailable", async () => {
    const go = vi.fn();
    await install({ version: "2.1.0", build: 1 }, { session: { setItem: () => { throw new Error("blocked"); } }, go, here: "file:///opt/app/index.html" });
    expect(go).toHaveBeenCalledWith("file:///opt/app/index.html?v=1");
  });
  it("knows a build it already tried, so a stale cache cannot loop the reload", () => {
    expect(alreadyTried(5, { getItem: () => "5" })).toBe(true);
    expect(alreadyTried(6, { getItem: () => "5" })).toBe(false);
    expect(alreadyTried(5, { getItem: () => { throw new Error("blocked"); } })).toBe(false);
  });
  it("asks for the version file next to the app, never from the cache", () => {
    expect(releaseUrl("http://tv.local/app/index.html?v=3", 99)).toBe("http://tv.local/app/version.json?t=99");
  });
});
