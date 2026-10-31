import type Mpegts from "mpegts.js";
import { PlayFailure, type PlayerEngine, type Source } from "../engine";

/**
 * mpegts.js: a raw MPEG-TS stream over HTTP (the `.ts` links of many IPTV providers, which hls.js does not take
 * and which a TV's own decoder often refuses) played through Media Source. Loaded only when the ladder gets here.
 */
export class MpegTsEngine implements PlayerEngine {
  readonly id = "mpegts";
  private player: Mpegts.Player | null = null;
  private stopped = false;

  supports(source: Source): boolean {
    return typeof MediaSource !== "undefined" && !/\.m3u8?(\?|$)/i.test(source.url);
  }

  async start(video: HTMLVideoElement, source: Source): Promise<void> {
    this.stopped = false;
    const { default: lib } = await import("mpegts.js");
    if (this.stopped || !lib.isSupported()) throw new PlayFailure(this.id, "unsupported");
    return new Promise<void>((resolve, reject) => {
      const player = lib.createPlayer(
        { type: "mpegts", isLive: true, url: source.url, ...(source.headers ? { headers: source.headers } : {}) },
        { enableWorker: true, liveBufferLatencyChasing: true, lazyLoad: false },
      );
      this.player = player;
      player.on(lib.Events.ERROR, (type: string, detail: string) => reject(new PlayFailure(this.id, "error", `${type}/${detail}`)));
      video.addEventListener("playing", () => resolve(), { once: true });
      player.attachMediaElement(video);
      player.load();
      void Promise.resolve(player.play()).catch(() => undefined);
    });
  }

  stop(): void {
    this.stopped = true;
    try { this.player?.destroy(); } catch { /* already gone */ }
    this.player = null;
  }
}
