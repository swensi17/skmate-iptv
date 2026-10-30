/** What a player engine must offer; the ladder and the UI know nothing beyond this. */
export interface Source {
  url: string;
  headers?: Record<string, string>;
}

export type FailReason = "error" | "timeout" | "unsupported";

export interface PlayerEngine {
  readonly id: string;
  /** Cheap check, no network: can this engine even try this source on this device? */
  supports(source: Source): boolean;
  /** Resolves when the first frame is playing, rejects with a [PlayFailure] otherwise. */
  start(video: HTMLVideoElement, source: Source): Promise<void>;
  /** Releases everything; safe to call twice. */
  stop(): void;
}

export class PlayFailure extends Error {
  constructor(readonly engineId: string, readonly reason: FailReason, detail?: string) {
    super(`${engineId}: ${reason}${detail ? ` (${detail})` : ""}`);
    this.name = "PlayFailure";
  }
}
