import { PlayFailure, type PlayerEngine, type Source } from "../engine";
import type { TrackOption, TrackSource } from "../tracks";

/*
 * Samsung's own player (webapis.avplay, Tizen): the one way to choose the sound of a raw MPEG-TS stream with several
 * tracks, which the page's <video> neither lists nor switches (#822). It draws on the TV's video plane under the page,
 * in the box of an <object type="application/avplayer"> laid over the <video> (kept empty meanwhile). Used only when
 * asked for (the "Sound" tile on a stream that is not HLS), never as the first engine.
 */

interface AvTrack { index: number; type: string; extra_info: string }
interface AvPlay {
  open(url: string): void;
  close(): void;
  stop(): void;
  play(): void;
  prepareAsync(ok: () => void, fail: (e: unknown) => void): void;
  setListener(l: Record<string, (...a: unknown[]) => void>): void;
  setDisplayRect(x: number, y: number, w: number, h: number): void;
  setDisplayMethod?(m: string): void;
  getTotalTrackInfo(): AvTrack[];
  getCurrentStreamInfo?(): AvTrack[];
  setSelectTrack(type: string, index: number): void;
  getState?(): string;
}

function avplay(): AvPlay | null {
  const w = (typeof window !== "undefined" ? window : {}) as { webapis?: { avplay?: AvPlay } };
  return w.webapis?.avplay ?? null;
}

function isTizen(): boolean {
  return typeof window !== "undefined" && (!!(window as unknown as { tizen?: unknown }).tizen || /Tizen/i.test(navigator.userAgent));
}

/** Samsung's webapis.js, where the page did not load it (a shell from before 2.7.1 has no tag for it). */
let loading: Promise<void> | null = null;
export function loadWebapis(): Promise<void> {
  if (avplay() || !isTizen()) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve) => {
      const s = document.createElement("script");
      s.src = "$WEBAPIS/webapis/webapis.js";
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
      setTimeout(resolve, 3000);
    });
  }
  return loading;
}

/** A track's language and name from its extra_info (JSON on most models, a loose text on some). */
export function avTrackOption(t: AvTrack, n: number, selected: boolean): TrackOption {
  let lang = "";
  let label = "";
  try {
    const x = JSON.parse(t.extra_info) as { language?: string; track_lang?: string; name?: string };
    lang = x.language || x.track_lang || "";
    label = x.name || "";
  } catch {
    const m = /language"?\s*[:=]\s*"?([A-Za-z-]{2,8})/.exec(t.extra_info || "");
    lang = m ? (m[1] as string) : "";
  }
  return { id: t.index, label: label || lang || `${n + 1}`, lang, selected };
}

export class AvPlayEngine implements PlayerEngine {
  readonly id = "avplay";
  private video: HTMLVideoElement | null = null;
  private object: HTMLElement | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private rect = "";
  private listeners: Array<() => void> = [];
  private chosen: number | null = null;

  supports(source: Source): boolean {
    return isTizen() && (!source.headers || Object.keys(source.headers).length === 0);
  }

  async start(video: HTMLVideoElement, source: Source): Promise<void> {
    await loadWebapis();
    const av = avplay();
    if (!av) throw new PlayFailure(this.id, "unsupported", "no webapis.avplay");
    this.video = video;
    const host = video.parentElement;
    if (!host) throw new PlayFailure(this.id, "unsupported", "no box");
    const obj = document.createElement("object");
    obj.setAttribute("type", "application/avplayer");
    obj.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;";
    host.insertBefore(obj, video);
    this.object = obj;
    video.style.visibility = "hidden";
    try { av.stop(); av.close(); } catch { /* nothing was open */ }
    return new Promise<void>((resolve, reject) => {
      try {
        av.open(source.url);
        av.setListener({
          onerror: (e: unknown) => this.fail(String(e)),
          onstreamcompleted: () => undefined,
        });
        this.place();
        try { av.setDisplayMethod?.("PLAYER_DISPLAY_MODE_LETTER_BOX"); } catch { /* older models */ }
        av.prepareAsync(() => {
          try {
            av.play();
            this.timer = setInterval(() => this.place(), 400); // the box moves (the panel's corner, full screen)
            resolve();
          } catch (e) { reject(new PlayFailure(this.id, "error", String(e))); }
        }, (e) => reject(new PlayFailure(this.id, "error", String(e))));
      } catch (e) {
        reject(new PlayFailure(this.id, "error", String(e)));
      }
    });
  }

  private fail(detail: string): void {
    const v = this.video;
    if (v) v.dispatchEvent(new Event("waiting")); // the player's own watch opens the channel again
    void detail;
  }

  /** The plane in the object's box, in the 1920x1080 frame the TV's player counts in. */
  private place(): void {
    const av = avplay();
    const obj = this.object;
    if (!av || !obj) return;
    const r = obj.getBoundingClientRect();
    const k = 1920 / Math.max(1, window.innerWidth || 1920);
    const box = [r.left, r.top, r.width, r.height].map((n) => Math.round(n * k));
    const key = box.join(",");
    if (key === this.rect) return;
    this.rect = key;
    try { av.setDisplayRect(box[0] as number, box[1] as number, box[2] as number, box[3] as number); } catch { /* not ready */ }
  }

  tracks(): TrackSource | null {
    const read = (): TrackOption[] => {
      const av = avplay();
      if (!av) return [];
      let all: AvTrack[] = [];
      try { all = av.getTotalTrackInfo() || []; } catch { return []; }
      let current = this.chosen;
      if (current === null) {
        try { current = (av.getCurrentStreamInfo?.() || []).find((t) => t.type === "AUDIO")?.index ?? null; } catch { current = null; }
      }
      const audio = all.filter((t) => t.type === "AUDIO");
      return audio.map((t, n) => avTrackOption(t, n, current !== null ? t.index === current : n === 0));
    };
    return {
      audio: read,
      subtitles: () => [],
      selectAudio: (id) => {
        try { avplay()?.setSelectTrack("AUDIO", id); this.chosen = id; } catch { /* the TV refused */ }
        this.listeners.forEach((f) => f());
      },
      selectSubtitle: () => undefined,
      watch: (fn) => {
        this.listeners.push(fn);
        const t = setTimeout(fn, 1500); // some models list the tracks a moment after playing starts
        return () => { clearTimeout(t); this.listeners = this.listeners.filter((f) => f !== fn); };
      },
    };
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.rect = "";
    this.chosen = null;
    this.listeners = [];
    const av = avplay();
    try { av?.stop(); av?.close(); } catch { /* already closed */ }
    this.object?.parentElement?.removeChild(this.object);
    this.object = null;
    if (this.video) this.video.style.visibility = "";
    this.video = null;
  }
}
