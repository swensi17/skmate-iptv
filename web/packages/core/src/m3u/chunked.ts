import { m3uStart, m3uStep, type Channel } from "./parse";

/** One time slice on a weak TV: what is left of a 16 ms frame goes to drawing and key presses. */
export const SLICE_MS = 8;

const now = (): number => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

type Yielder = () => Promise<void>;

/**
 * Gives the browser a turn: a MessageChannel message (no 4 ms floor like setTimeout, and drawing and input run between
 * messages), setTimeout where there is no MessageChannel. Chromium 63 has both.
 */
export function makeYield(): Yielder {
  if (typeof MessageChannel === "function") {
    const ch = new MessageChannel();
    const waiting: Array<() => void> = [];
    ch.port1.onmessage = () => { const f = waiting.shift(); if (f) f(); };
    return () => new Promise<void>((resolve) => { waiting.push(resolve); ch.port2.postMessage(0); });
  }
  return () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}

export interface ChunkedOptions {
  /** Time slice in ms (default 8). */
  budgetMs?: number;
  /** Called with a fresh copy of what is read so far, at these counts and no more often: first chunk, then growing. */
  milestones?: readonly number[];
  onPartial?: (channels: Channel[]) => void;
  /** True when the result is not wanted any more (another playlist was chosen): the work stops at once. */
  cancelled?: () => boolean;
  yieldFn?: Yielder;
}

/** Counts at which the screen is refreshed: the first channels at once, then roughly every fourfold, so a 50k list redraws ~5 times, not 500. */
export const DEFAULT_MILESTONES: readonly number[] = [150, 800, 4000, 20000, 100000];

/**
 * The same result as [parseM3U], read in short slices so keys and drawing stay smooth while a big playlist loads.
 * Resolves with the whole list (all channels, in order), or null when [cancelled] fired.
 */
export async function parseM3UChunked(text: string, opts: ChunkedOptions = {}): Promise<Channel[] | null> {
  const budget = opts.budgetMs ?? SLICE_MS;
  const yieldNow = opts.yieldFn ?? makeYield();
  const marks = opts.milestones ?? DEFAULT_MILESTONES;
  const st = m3uStart(text);
  let next = 0;
  for (;;) {
    if (opts.cancelled?.()) return null;
    const t0 = now();
    const done = m3uStep(st, () => now() - t0 >= budget);
    if (done) return opts.cancelled?.() ? null : st.channels;
    if (opts.onPartial && next < marks.length && st.channels.length >= (marks[next] as number)) {
      while (next < marks.length && st.channels.length >= (marks[next] as number)) next++;
      opts.onPartial(st.channels.slice());
    }
    await yieldNow();
  }
}
