import type Hls from "hls.js";
import { PlayFailure, type PlayerEngine, type Source } from "../engine";

/**
 * hls.js on top of Media Source: for TVs whose own decoder does not take HLS, and for playlists that need
 * headers. The library is large, so it is fetched only when the ladder actually reaches this engine.
 */
export class HlsJsEngine implements PlayerEngine {
  readonly id = "hlsjs";
  private hls: Hls | null = null;
  private stopped = false;

  supports(source: Source): boolean {
    return typeof MediaSource !== "undefined" && /\.m3u8(\?|$)/i.test(source.url);
  }

  async start(video: HTMLVideoElement, source: Source): Promise<void> {
    this.stopped = false;
    const { default: HlsLib } = await import("hls.js");
    if (this.stopped || !HlsLib.isSupported()) throw new PlayFailure(this.id, "unsupported");
    return new Promise<void>((resolve, reject) => {
      const hls = new HlsLib({
        enableWorker: true,
        lowLatencyMode: false,
        xhrSetup: (xhr) => {
          for (const [k, v] of Object.entries(source.headers ?? {})) xhr.setRequestHeader(k, v);
        },
      });
      this.hls = hls;
      hls.on(HlsLib.Events.ERROR, (_e, data) => {
        if (data.fatal) reject(new PlayFailure(this.id, "error", data.details));
      });
      video.addEventListener("playing", () => resolve(), { once: true });
      hls.on(HlsLib.Events.MANIFEST_PARSED, () => { void video.play().catch(() => undefined); });
      hls.loadSource(source.url);
      hls.attachMedia(video);
    });
  }

  stop(): void {
    this.stopped = true;
    this.hls?.destroy();
    this.hls = null;
  }
}
