import { describe, expect, it } from "vitest";
import { classifyFailure, probeFailure, reasonForStatus } from "./diagnose";
import { audioToSelect, type TrackOption } from "./tracks";
import { codecName, nextFacts, standardFps } from "./facts";

describe("classifyFailure (PlayerErrors.classify)", () => {
  it("names the HTTP statuses the error screen explains", () => {
    expect(classifyFailure("hlsjs: error (manifestLoadError http error 404)")).toBe("http404");
    expect(classifyFailure("mpegts: error (NetworkError/HttpStatusCodeInvalid http error 403)")).toBe("http403");
    expect(classifyFailure("http error 509")).toBe("http509");
    expect(classifyFailure("status code: 429")).toBe("oneSession");
    expect(classifyFailure("response code 401")).toBe("http401");
  });
  it("says nothing for an engine's bare words", () => {
    expect(classifyFailure("native: error (4)")).toBeNull();
    expect(classifyFailure("hlsjs: error (bufferStalledError)")).toBeNull();
  });
  it("a server error means the provider cannot be reached", () => {
    expect(reasonForStatus(502)).toBe("network");
    expect(reasonForStatus(200)).toBeNull();
    expect(reasonForStatus(404)).toBe("http404");
  });
});

describe("probeFailure (LivePreviewEngine.probeWhy)", () => {
  it("takes the status from one request and drops the body", async () => {
    let cancelled = false;
    const r = await probeFailure("http://x/live.ts", async () => ({ status: 404, body: { cancel: async () => { cancelled = true; } } }));
    expect(r).toEqual({ reason: "http404", raw: "http error 404" });
    expect(cancelled).toBe(true);
  });
  it("an opaque answer (no CORS) names no reason; two failures mean no connection", async () => {
    const opaque = await probeFailure("http://x/a", async (_u, init) => { if (init?.mode === "cors") throw new TypeError("cors"); return { status: 0 }; });
    expect(opaque.reason).toBeNull();
    const down = await probeFailure("http://x/a", async () => { throw new TypeError("down"); });
    expect(down.reason).toBe("network");
  });
  it("no answer within the limit is a network failure", async () => {
    const r = await probeFailure("http://x/a", () => new Promise(() => undefined), 20);
    expect(r.reason).toBe("network");
  });
});

describe("audio kept by its name (2.5.2)", () => {
  const tracks: TrackOption[] = [
    { id: 0, label: "Track 1", lang: "", selected: true },
    { id: 1, label: "Track 2 - [English]", lang: "", selected: false },
  ];
  it("a track without a language is found by its name", () => {
    expect(audioToSelect(tracks, undefined, "Track 2 - [English]")?.id).toBe(1);
    expect(audioToSelect(tracks, undefined, "track 2 - [english]")?.id).toBe(1);
    expect(audioToSelect(tracks, undefined, "Track 1")).toBeNull(); // already playing
    expect(audioToSelect(tracks.slice(0, 1), undefined, "Track 1")).toBeNull();
  });
});

describe("stream facts (TvBoxStreamCorner 2.5.4)", () => {
  it("names codecs as people know them", () => {
    expect(codecName("avc1.64001f")).toBe("H.264");
    expect(codecName("hvc1.1.6.L93.B0")).toBe("H.265");
    expect(codecName("H264 - MPEG-4 AVC (part 10)")).toBe("H.264");
    expect(codecName("")).toBeNull();
  });
  it("shows only a frame rate television uses", () => {
    expect(standardFps(49.6)).toBe(50);
    expect(standardFps(29.97)).toBe(30);
    expect(standardFps(113)).toBeNull();
    expect(standardFps(null)).toBeNull();
  });
  it("measures the bitrate and frames from two looks, smoothed", () => {
    const a = nextFacts(null, null, { at: 0, frames: 100, bytes: 1_000_000 }, 1080, { codec: "avc1.64", channels: 2 });
    expect(a).toEqual({ height: 1080, fps: null, codec: "H.264", channels: 2, kbps: null });
    const b = nextFacts(a, { at: 0, frames: 100, bytes: 1_000_000 }, { at: 1000, frames: 125, bytes: 1_500_000 }, 1080, null);
    expect(b.kbps).toBe(4000);
    expect(b.fps).toBe(25);
    expect(b.codec).toBe("H.264");
  });
});
