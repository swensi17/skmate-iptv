import { describe, expect, it } from "vitest";
import type { Channel } from "@skmate/core";
import { MAX_RECENT, pushRecent, recentChannels } from "./history";

const ch = (id: string, name: string): Channel => ({ id, name, url: `u${id}`, group: "" });

describe("history", () => {
  it("puts the latest first and never repeats a channel", () => {
    expect(pushRecent(["b", "c"], "a")).toEqual(["a", "b", "c"]);
    expect(pushRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
  });
  it("is capped", () => {
    const full = Array.from({ length: MAX_RECENT }, (_, i) => `k${i}`);
    const next = pushRecent(full, "new");
    expect(next).toHaveLength(MAX_RECENT);
    expect(next[0]).toBe("new");
  });
  it("skips channels that left the playlist", () => {
    const all = [ch("1", "A"), ch("2", "B")];
    expect(recentChannels(all, ["B|u2", "gone", "A|u1"]).map((c) => c.id)).toEqual(["2", "1"]);
  });
});
