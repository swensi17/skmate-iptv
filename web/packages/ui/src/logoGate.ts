/**
 * Keeps channel logos from competing with the D-pad on a weak TV: while the list is being moved (held ▲/▼, paging,
 * wheel, fling) no logo starts loading; once it has been still for [QUIET_MS] the pending logos load, at most
 * [MAX_LOADS] at a time. Logos already loaded once come straight from the cache and are never held back.
 */
export const QUIET_MS = 160;
export const MAX_LOADS = 4;

export interface LogoGate {
  /** The list moved: hold new logo loads until it has been still for QUIET_MS. */
  busy(): void;
  /** Ask to load [src]; [go] runs when allowed. Returns the cancel function (call it when the row goes away). */
  request(src: string, go: () => void): () => void;
  /** The load of [src] finished (loaded or failed): frees its slot. */
  done(src: string, ok?: boolean): void;
  /** Loaded before in this session (the browser has it: showing it is cheap). */
  isSeen(src: string): boolean;
}

export function createLogoGate(
  timer: { set: (cb: () => void, ms: number) => unknown; clear: (h: unknown) => void } = {
    set: (cb, ms) => setTimeout(cb, ms),
    clear: (h) => clearTimeout(h as number),
  },
  quietMs = QUIET_MS,
  maxLoads = MAX_LOADS,
): LogoGate {
  const seen = new Set<string>();
  const waiting: Array<{ src: string; go: () => void }> = [];
  const active = new Set<string>();
  let isBusy = false;
  let handle: unknown = null;

  const pump = () => {
    while (!isBusy && active.size < maxLoads && waiting.length) {
      const next = waiting.shift()!;
      active.add(next.src);
      next.go();
    }
  };

  return {
    busy() {
      isBusy = true;
      if (handle !== null) timer.clear(handle);
      handle = timer.set(() => { handle = null; isBusy = false; pump(); }, quietMs);
    },
    request(src, go) {
      if (seen.has(src)) { go(); return () => {}; }
      const entry = { src, go };
      waiting.push(entry);
      pump();
      return () => {
        const i = waiting.indexOf(entry);
        if (i >= 0) waiting.splice(i, 1);
      };
    },
    done(src, ok = true) {
      if (ok) seen.add(src);
      active.delete(src);
      pump();
    },
    isSeen: (src) => seen.has(src),
  };
}

export const logoGate: LogoGate = createLogoGate();
