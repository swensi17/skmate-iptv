import { PlayFailure, type PlayerEngine, type Source } from "./engine";

export interface LadderEvents {
  /** An engine is about to be tried. */
  onTry?(engineId: string): void;
  /** An engine gave up; the ladder moves to the next one. */
  onFail?(failure: PlayFailure): void;
}

export interface LadderOptions {
  /** How long one engine may take to show the first frame. */
  openTimeoutMs?: number;
}

export const DEFAULT_OPEN_TIMEOUT_MS = 12_000;

function withTimeout<T>(work: Promise<T>, ms: number, engineId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PlayFailure(engineId, "timeout")), ms);
    work.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Tries the engines in order until one plays. The engine that fails is stopped before the next one
 * starts, so two never fight over one video element. Returns the engine that is playing.
 */
export class PlayerLadder {
  private active: PlayerEngine | null = null;
  private run = 0;

  constructor(
    private readonly engines: readonly PlayerEngine[],
    private readonly events: LadderEvents = {},
    private readonly options: LadderOptions = {},
  ) {}

  get current(): PlayerEngine | null { return this.active; }

  async play(video: HTMLVideoElement, source: Source): Promise<PlayerEngine> {
    this.stop();
    const run = ++this.run;
    const timeout = this.options.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS;
    let last: PlayFailure | null = null;
    for (const engine of this.engines) {
      if (run !== this.run) throw new PlayFailure(engine.id, "error", "replaced by a newer request");
      if (!engine.supports(source)) continue;
      this.events.onTry?.(engine.id);
      try {
        await withTimeout(engine.start(video, source), timeout, engine.id);
        if (run !== this.run) { engine.stop(); throw new PlayFailure(engine.id, "error", "replaced by a newer request"); }
        this.active = engine;
        return engine;
      } catch (e) {
        engine.stop();
        last = e instanceof PlayFailure ? e : new PlayFailure(engine.id, "error", String(e));
        this.events.onFail?.(last);
      }
    }
    throw last ?? new PlayFailure("none", "unsupported");
  }

  stop(): void {
    this.run++;
    this.active?.stop();
    this.active = null;
  }
}
