/*
 * What the stream is, for the TV-box info's line of what follows (Android 2.5.3/2.5.4 StreamFacts,
 * TvBoxStreamCorner.kt tvBoxStreamFacts, LivePreviewEngine.noteFacts/noteRates): "1080p · 50 fps · H.264 · Stereo ·
 * 4.7 Mbps". The engine says what it knows (the codec, the sound's channels, a declared frame rate); the rest is
 * measured from counters the browser already keeps (frames decoded, bytes decoded), read once a second.
 */

/** Each part null while it is not known (Android StreamFacts). */
export interface StreamFacts {
  height: number | null;
  fps: number | null;
  codec: string | null;
  channels: number | null;
  kbps: number | null;
}

/** What an engine itself can tell: hls.js and mpegts.js read it from the stream; the TV's own decoder says nothing. */
export interface EngineFacts {
  codec?: string | null;
  channels?: number | null;
  fps?: number | null;
  /** The bitrate the playlist declares for the level playing (a fallback where bytes cannot be counted). */
  kbps?: number | null;
}

const CODEC_NAMES: Record<string, string> = {
  h264: "H.264", "mpeg-2": "MPEG-2", avc1: "H.264", avc3: "H.264", x264: "H.264",
  hevc: "H.265", h265: "H.265", hev1: "H.265", hvc1: "H.265",
  mpgv: "MPEG-2", mp2v: "MPEG-2", mp4v: "MPEG-4",
  av01: "AV1", vp90: "VP9", vp09: "VP9", vp80: "VP8", vp8: "VP8", vp9: "VP9",
};

/** The codec as people know it: "hevc" and "hvc1.1.6.L93" are H.265, "avc1.64001f" H.264 (LivePreviewEngine.codecName). */
export function codecName(raw: string | null | undefined): string | null {
  const first = (raw ?? "").split(",")[0] ?? "";
  const c = (first.split(" - ")[0] ?? "").trim().toLowerCase().split(".")[0] ?? "";
  if (!c) return null;
  return CODEC_NAMES[c] ?? c.toUpperCase();
}

/** The frame rates television uses (film, PAL, NTSC and their doubles). */
const STANDARD_FPS = [24, 25, 30, 50, 60];
const FPS_SNAP = 0.06;

/**
 * A measured rate as TVs name it (49.6 is 50, 29.9 is 30), or null when it is near none of them: some decoders count
 * more pictures than are shown, and a wrong "113 fps" is worse than none (2.5.4).
 */
export function standardFps(fps: number | null | undefined): number | null {
  if (fps == null || !(fps > 0)) return null;
  return STANDARD_FPS.find((s) => Math.abs(fps - s) / s < FPS_SNAP) ?? null;
}

/** The smoothing of the measured figures (BITRATE_WEIGHT) and the beat at which they reach the screen. */
export const FACTS_WEIGHT = 0.3;
export const FACTS_BEAT_MS = 2_000;
const MAX_FPS = 120;

/** The counters one look reads: decoded frames and bytes since the element began, and when. */
export interface FactsSample { at: number; frames: number | null; bytes: number | null }

/**
 * One look of the sampler (noteRates): the new facts from the last ones, two samples and what the engine says. The
 * bitrate is the bytes decoded between two looks, smoothed; the frame rate the engine's own, else the frames counted.
 */
export function nextFacts(prev: StreamFacts | null, last: FactsSample | null, cur: FactsSample, height: number, engine: EngineFacts | null): StreamFacts {
  const elapsed = last ? cur.at - last.at : 0;
  let kbps = prev?.kbps ?? null;
  let fps = engine?.fps && engine.fps > 0 ? engine.fps : prev?.fps ?? null;
  if (last && elapsed > 0) {
    if (cur.bytes != null && last.bytes != null && cur.bytes > last.bytes && last.bytes > 0) {
      const now = ((cur.bytes - last.bytes) * 8) / elapsed; // bits per ms = kbit/s
      kbps = Math.round(kbps != null ? kbps * (1 - FACTS_WEIGHT) + now * FACTS_WEIGHT : now);
    }
    if (!(engine?.fps && engine.fps > 0) && cur.frames != null && last.frames != null && cur.frames > last.frames && last.frames > 0) {
      const m = ((cur.frames - last.frames) * 1000) / elapsed;
      if (m >= 1 && m <= MAX_FPS) fps = fps != null ? fps * (1 - FACTS_WEIGHT) + m * FACTS_WEIGHT : m;
    }
  }
  if (kbps == null && engine?.kbps && engine.kbps > 0) kbps = Math.round(engine.kbps);
  return {
    height: height > 0 ? height : prev?.height ?? null,
    fps,
    codec: codecName(engine?.codec) ?? prev?.codec ?? null,
    channels: engine?.channels && engine.channels > 0 ? engine.channels : prev?.channels ?? null,
    kbps,
  };
}

interface DecodedCounters {
  webkitDecodedFrameCount?: number;
  webkitVideoDecodedByteCount?: number;
  webkitAudioDecodedByteCount?: number;
  getVideoPlaybackQuality?: () => { totalVideoFrames: number };
}

/** The element's own counters, feature-checked (Chromium has the webkit ones; others only the playback quality). */
export function readCounters(el: HTMLVideoElement, at: number = Date.now()): FactsSample {
  const v = el as unknown as DecodedCounters;
  let frames: number | null = null;
  try {
    if (typeof v.getVideoPlaybackQuality === "function") frames = v.getVideoPlaybackQuality().totalVideoFrames;
    else if (typeof v.webkitDecodedFrameCount === "number") frames = v.webkitDecodedFrameCount;
  } catch { /* not there */ }
  const vb = v.webkitVideoDecodedByteCount;
  const ab = v.webkitAudioDecodedByteCount;
  const bytes = typeof vb === "number" ? vb + (typeof ab === "number" ? ab : 0) : null;
  return { at, frames, bytes };
}
