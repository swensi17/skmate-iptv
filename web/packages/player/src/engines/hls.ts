import type Hls from "hls.js";
import { PlayFailure, type PlayerEngine, type Source } from "../engine";

/** How many times the whole decoder is rebuilt, and how many times one decoder tries to heal itself. */
const REBUILDS = 2;
const MEDIA_RECOVERIES = 2;
const NETWORK_RETRIES = 1;

/** `localStorage.setItem("skmate.hlsdebug", "1")` turns on hls.js' own log: the way to see why one channel will not play. */
function debugOn(): boolean {
  try { return localStorage.getItem("skmate.hlsdebug") === "1"; } catch { return false; }
}

/** A stream that changes its codec on the fly needs a fresh decoder: hls.js says so with this reason. */
class NeedsRebuild extends PlayFailure {}

/**
 * hls.js on top of Media Source: for TVs whose own decoder does not take HLS, and for playlists that need
 * headers. The library is large, so it is fetched only when the ladder actually reaches this engine.
 * Fatal errors are healed the way hls.js documents (media recovery, one network retry, a rebuilt decoder)
 * before the engine gives up and lets the ladder move on.
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
    for (let attempt = 0; ; attempt++) {
      try {
        await this.once(HlsLib, video, source);
        return;
      } catch (e) {
        this.destroy();
        if (this.stopped || !(e instanceof NeedsRebuild) || attempt >= REBUILDS) throw e;
        video.removeAttribute("src");
        video.load(); // a clean element for the new decoder
      }
    }
  }

  private once(HlsLib: typeof Hls, video: HTMLVideoElement, source: Source): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const hls = new HlsLib({
        debug: debugOn(),
        enableWorker: true,
        lowLatencyMode: false,
        xhrSetup: (xhr) => {
          for (const [k, v] of Object.entries(source.headers ?? {})) xhr.setRequestHeader(k, v);
        },
      });
      this.hls = hls;
      let media = 0;
      let network = 0;
      hls.on(HlsLib.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.details === "mediaSourceRequiresReset") return reject(new NeedsRebuild(this.id, "error", data.details));
        if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR && media < MEDIA_RECOVERIES) {
          if (media++ === 1) hls.swapAudioCodec(); // the second try also switches the audio codec guess
          hls.recoverMediaError();
          return;
        }
        if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR && network < NETWORK_RETRIES) {
          network++;
          hls.startLoad();
          return;
        }
        reject(new PlayFailure(this.id, "error", data.details));
      });
      video.addEventListener("playing", () => resolve(), { once: true });
      hls.on(HlsLib.Events.MANIFEST_PARSED, () => { void video.play().catch(() => undefined); });
      hls.loadSource(source.url);
      hls.attachMedia(video);
    });
  }

  private destroy(): void {
    this.hls?.destroy();
    this.hls = null;
  }

  stop(): void {
    this.stopped = true;
    this.destroy();
  }
}
