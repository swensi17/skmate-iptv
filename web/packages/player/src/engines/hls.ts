import type Hls from "hls.js";
import { PlayFailure, type PlayerEngine, type Source } from "../engine";
import type { EngineFacts } from "../facts";
import { hlsTracks, type HlsTrackApi, type TrackSource } from "../tracks";

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
export interface HlsOptions {
  bufferSeconds?: number | undefined;
  /** Timeshift: start this many seconds behind the live edge and keep the played picture to wind back in. */
  liveBehindSeconds?: number | undefined;
  /** The tallest picture to take, in lines (a multiview tile without the sound: 720, as on Android); absent for the best there is. */
  maxHeight?: number | undefined;
}

/**
 * The quality level to cap at: the best one whose picture is no taller than [maxHeight] lines, else the lowest.
 * [heights] are the levels' heights in hls.js's order (by bitrate); a level that names none (0) is never preferred.
 */
export function capLevelFor(heights: readonly number[], maxHeight: number): number {
  let best = -1;
  let lowest = -1;
  heights.forEach((h, i) => {
    if (!(h > 0)) return;
    if (h <= maxHeight && (best < 0 || h >= (heights[best] as number))) best = i;
    if (lowest < 0 || h < (heights[lowest] as number)) lowest = i;
  });
  return best >= 0 ? best : Math.max(0, lowest);
}

/** How much played live picture hls.js keeps to wind back in while timeshifting (the browser may keep less). */
const TIMESHIFT_BACK_BUFFER_S = 900;

/**
 * An `.m3u8` address, or one that names no file type at all (a Stalker channel of the Windows app, a provider's
 * `/play/123`): what it holds is only known once opened, so hls.js has a go before mpegts.js. Pure, so it is tested.
 */
export function looksLikeHls(url: string): boolean {
  if (/\.m3u8(\?|$)/i.test(url)) return true;
  let path: string;
  try { path = new URL(url).pathname; } catch { return false; }
  const last = path.split("/").pop() ?? "";
  return !/\.[a-z0-9]{1,5}$/i.test(last);
}

export class HlsJsEngine implements PlayerEngine {
  readonly id = "hlsjs";

  constructor(private readonly options: HlsOptions = {}) {}
  private hls: Hls | null = null;
  private video: HTMLVideoElement | null = null;
  private stopped = false;

  supports(source: Source): boolean {
    return typeof MediaSource !== "undefined" && looksLikeHls(source.url);
  }

  async start(video: HTMLVideoElement, source: Source): Promise<void> {
    this.stopped = false;
    this.video = video;
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
        ...(this.options.bufferSeconds ? { maxBufferLength: this.options.bufferSeconds, maxMaxBufferLength: this.options.bufferSeconds * 2 } : {}),
        ...(this.options.liveBehindSeconds ? { liveSyncDuration: this.options.liveBehindSeconds, backBufferLength: TIMESHIFT_BACK_BUFFER_S } : {}),
        enableWorker: true,
        lowLatencyMode: false,
        // A fragment is parsed as it downloads, not after: on a slow provider with 10 s fragments the picture comes
        // after a part of the first one, not the whole (measured: 2-10 s became 1.3-3.2 s to the first frame).
        progressive: true,
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
        // The status of a load that failed goes with it: "http error 404" is what names the reason on the error screen.
        const code = (data as { response?: { code?: number } }).response?.code;
        reject(new PlayFailure(this.id, "error", code ? `${data.details} http error ${code}` : data.details));
      });
      video.addEventListener("playing", () => resolve(), { once: true });
      hls.on(HlsLib.Events.MANIFEST_PARSED, (_e, data) => {
        const cap = this.options.maxHeight;
        if (cap) hls.autoLevelCapping = capLevelFor(data.levels.map((l) => l.height), cap);
        void video.play().catch(() => undefined);
      });
      hls.loadSource(source.url);
      hls.attachMedia(video);
    });
  }

  /** hls.js' alternate audio and subtitle renditions, and the in-stream captions it puts on the element. */
  tracks(): TrackSource | null {
    const video = this.video;
    return video ? hlsTracks(() => this.hls as unknown as HlsTrackApi | null, video) : null;
  }

  /** The playing level's codec, declared frame rate and bitrate, and the audio rendition's channels. */
  facts(): EngineFacts | null {
    const hls = this.hls;
    if (!hls) return null;
    const level = hls.levels[hls.currentLevel >= 0 ? hls.currentLevel : hls.loadLevel] as
      | { videoCodec?: string; codecSet?: string; frameRate?: number; bitrate?: number } | undefined;
    const audio = hls.audioTracks[hls.audioTrack] as { channels?: string } | undefined;
    const channels = audio?.channels ? parseInt(audio.channels, 10) : NaN;
    return {
      codec: level?.videoCodec ?? null,
      fps: level?.frameRate && level.frameRate > 0 ? level.frameRate : null,
      kbps: level?.bitrate ? level.bitrate / 1000 : null,
      channels: Number.isFinite(channels) ? channels : null,
    };
  }

  private destroy(): void {
    this.hls?.destroy();
    this.hls = null;
  }

  stop(): void {
    this.stopped = true;
    this.video = null;
    this.destroy();
  }
}
