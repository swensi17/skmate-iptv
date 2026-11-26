import { describe, expect, it } from "vitest";
import { AUTHOR_CHECKED_EVERY_MS, AUTHOR_URL, AUTHOR_VERSION_URL, needsReload, versionOf } from "./authorPlaylist";

describe("the author's playlist", () => {
  it("asks its fingerprint next to it, behind the same proxy path as the remote", () => {
    expect(AUTHOR_URL).toBe("https://nutrokstore.xyz/skmate/playlist.m3u8");
    expect(AUTHOR_VERSION_URL).toBe("https://nutrokstore.xyz/skmate/tv/version");
  });

  it("reads the fingerprint from the server's answer and nothing else", () => {
    expect(versionOf({ v: "bc25254fefa37a02", e: 17 })).toEqual({ v: "bc25254fefa37a02", e: 17 });
    expect(versionOf({ v: "bc25254fefa37a02" })).toEqual({ v: "bc25254fefa37a02", e: 0 });
    expect(versionOf({ v: "" })).toBeNull();
    expect(versionOf({})).toBeNull();
    expect(versionOf(null)).toBeNull();
  });

  it("brings the list at once after the author's change, after the checks only now and then", () => {
    const seen = { v: "a", e: 1 };
    expect(needsReload(seen, { v: "a", e: 1 }, AUTHOR_CHECKED_EVERY_MS * 2)).toBe(false);
    expect(needsReload(seen, { v: "b", e: 2 }, 1000)).toBe(true);
    expect(needsReload(seen, { v: "b", e: 1 }, 1000)).toBe(false);
    expect(needsReload(seen, { v: "b", e: 1 }, AUTHOR_CHECKED_EVERY_MS)).toBe(true);
  });
});
