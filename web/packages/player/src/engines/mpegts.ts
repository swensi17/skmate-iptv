import type Mpegts from "mpegts.js";
import { PlayFailure, type PlayerEngine, type Source } from "../engine";
import type { EngineFacts } from "../facts";
import { elementTracks, type TrackSource } from "../tracks";

/**
 * mpegts.js: a raw MPEG-TS stream over HTTP (the `.ts` links of many IPTV providers, which hls.js does not take
 * and which a TV's own decoder often refuses) played through Media Source. Loaded only when the ladder gets here.
 */
export class MpegTsEngine implements PlayerEngine {
  readonly id = "mpegts";
  private player: Mpegts.Player | null = null;
  private video: HTMLVideoElement | null = null;
  private stopped = false;

  supports(source: Source): boolean {
    return typeof MediaSource !== "undefined" && !/\.m3u8?(\?|$)/i.test(source.url);
  }

  async start(video: HTMLVideoElement, source: Source): Promise<void> {
    this.stopped = false;
    this.video = video;
    const { default: lib } = await import("mpegts.js");
    if (this.stopped || !lib.isSupported()) throw new PlayFailure(this.id, "unsupported");
    return new Promise<void>((resolve, reject) => {
      const player = lib.createPlayer(
        { type: "mpegts", isLive: true, url: source.url, ...(source.headers ? { headers: source.headers } : {}) },
        { enableWorker: true, liveBufferLatencyChasing: true, lazyLoad: false },
      );
      this.player = player;
      // An HTTP status of the request goes with the failure ("http error 404"): it names the reason on the error screen.
      player.on(lib.Events.ERROR, (type: string, detail: string, info?: { code?: number }) =>
        reject(new PlayFailure(this.id, "error", `${type}/${detail}${info?.code && info.code >= 100 ? ` http error ${info.code}` : ""}`)));
      video.addEventListener("playing", () => resolve(), { once: true });
      player.attachMediaElement(video);
      player.load();
      void Promise.resolve(player.play()).catch(() => undefined);
    });
  }

  /** mpegts.js plays the stream's first audio; whatever the element itself reports is offered. */
  tracks(): TrackSource | null {
    return this.video ? elementTracks(this.video) : null;
  }

  /** What mpegts.js read from the stream: the video codec, the frame rate it declares, the sound's channels. */
  facts(): EngineFacts | null {
    const info = (this.player as unknown as { mediaInfo?: { videoCodec?: string; fps?: number; audioChannelCount?: number } } | null)?.mediaInfo;
    if (!info) return null;
    return { codec: info.videoCodec ?? null, fps: info.fps && info.fps > 0 ? info.fps : null, channels: info.audioChannelCount ?? null };
  }

  stop(): void {
    this.stopped = true;
    this.video = null;
    try { this.player?.destroy(); } catch { /* already gone */ }
    this.player = null;
  }
}
