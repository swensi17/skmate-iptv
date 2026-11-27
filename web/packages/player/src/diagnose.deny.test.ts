import { describe, expect, it } from "vitest";
import { isDenyClip } from "./diagnose";

describe("isDenyClip", () => {
  it("sees the provider's placeholder clip", () => {
    expect(isDenyClip("http://err-ru.sulfat.li:8080/vod/deny4dealer1.mp4/tracks-v1a1/mono.m3u8", "http://r.faola.li/17114/index.m3u8?token=x")).toBe(true);
    expect(isDenyClip("http://err-ru.sulfat.li:8080/vod/deny4dealer1.mp4/index.m3u8", "http://r.faola.li/1/index.m3u8")).toBe(true);
  });
  it("leaves ordinary streams and an address that is itself named so", () => {
    expect(isDenyClip("http://a.b/live/1/tracks/seg1.ts", "http://a.b/live/1/index.m3u8")).toBe(false);
    expect(isDenyClip(undefined, "http://a.b/x.m3u8")).toBe(false);
    expect(isDenyClip("http://a.b/vod/deny1.mp4/x.m3u8", "http://a.b/vod/deny1.mp4/x.m3u8")).toBe(false);
  });
});
