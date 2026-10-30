import { PlayFailure, type PlayerEngine, type Source } from "../engine";

/** The TV's own decoder through `<video src>`: the lightest path, and the one that knows the TV's codecs. */
export class NativeEngine implements PlayerEngine {
  readonly id = "native";
  private video: HTMLVideoElement | null = null;

  supports(source: Source): boolean {
    // Request headers cannot be set on <video src>; such a source needs an engine that can.
    return !source.headers || Object.keys(source.headers).length === 0;
  }

  start(video: HTMLVideoElement, source: Source): Promise<void> {
    this.video = video;
    return new Promise<void>((resolve, reject) => {
      const done = (fn: () => void) => { video.removeEventListener("playing", onPlaying); video.removeEventListener("error", onError); fn(); };
      const onPlaying = () => done(resolve);
      const onError = () => done(() => reject(new PlayFailure(this.id, "error", String(video.error?.code ?? ""))));
      video.addEventListener("playing", onPlaying);
      video.addEventListener("error", onError);
      video.src = source.url;
      const p = video.play();
      if (p) p.catch(() => undefined); // autoplay refusal is reported by the missing "playing" event (timeout)
    });
  }

  stop(): void {
    const v = this.video;
    this.video = null;
    if (!v) return;
    v.removeAttribute("src");
    v.load();
  }
}
