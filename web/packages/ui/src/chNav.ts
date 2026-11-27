/**
 * Paging a list with the remote's CH+/CH- and rewind/fast-forward keys, as the Android app does (ui/components/ChNavPaging.kt
 * with the factory bindings of RemoteShortcuts.kt): CH+ and rewind go toward the first row by the "up" skip, CH- and
 * fast-forward toward the last row by the "down" skip; held for 600 ms they jump to the first / the last row. The jump
 * happens when the key is let go (Android acts on the key-up, the key-down is only swallowed). Settings › Remote buttons
 * switches it off ([ChNavConfig.enabled]) and sets the skips (default 10, 1..1000).
 */
export interface ChNavConfig {
  enabled: boolean;
  /** Rows toward the first row (CH+ / rewind). */
  up: number;
  /** Rows toward the last row (CH- / fast-forward). */
  down: number;
}

/** ChNavLimits.DEFAULT_SKIP and HARD_MAX. */
export const CH_NAV_DEFAULT_SKIP = 10;
export const CH_NAV_HARD_MAX = 1000;
/** ChNavPaging.kt PAGING_LONG_PRESS_MS. */
export const CH_NAV_LONG_MS = 600;

let config: ChNavConfig = { enabled: true, up: CH_NAV_DEFAULT_SKIP, down: CH_NAV_DEFAULT_SKIP };

export const clampSkip = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(1, Math.min(CH_NAV_HARD_MAX, Math.round(n))) : CH_NAV_DEFAULT_SKIP;

/** The app's setting, pushed here when the settings are applied; every list pages by it. */
export function setChNavConfig(c: Partial<ChNavConfig>): void {
  config = { enabled: c.enabled ?? config.enabled, up: clampSkip(c.up ?? config.up), down: clampSkip(c.down ?? config.down) };
}
export function getChNavConfig(): ChNavConfig {
  return config;
}

/** Toward the first row (-1): CH+ (427, webOS PageUp 33) and rewind (412); toward the last (1): CH- (428, 34) and fast-forward (417). */
export function pagingDirection(e: { key?: string; keyCode: number }): -1 | 0 | 1 {
  if (e.key === "ChannelUp" || e.key === "MediaRewind" || e.keyCode === 427 || e.keyCode === 33 || e.keyCode === 412) return -1;
  if (e.key === "ChannelDown" || e.key === "MediaFastForward" || e.keyCode === 428 || e.keyCode === 34 || e.keyCode === 417) return 1;
  return 0;
}

/**
 * The row a paging key lands on (ChNavPaging.kt:78-90): a page by the skip, or with [long] the first / last row
 * ([endJump] false keeps the page: the huge "All" list), kept inside the list. [current] when nothing moves.
 */
export function pagingTarget(dir: -1 | 1, long: boolean, current: number, last: number, cfg: ChNavConfig, endJump = true): number {
  const raw = long ? (endJump ? (dir < 0 ? 0 : last) : current) : dir < 0 ? current - cfg.up : current + cfg.down;
  return Math.max(0, Math.min(raw, Math.max(0, last)));
}

export interface Pager {
  /** A key went down: true when it is a paging key (swallow it). The press is timed from its first down. */
  down(e: { key?: string; keyCode: number }): boolean;
  /**
   * The key came up: the row to go to, null when nothing moves; [handled] says the key was a paging one that went down here
   * (swallow it). [now] is injectable for tests.
   */
  up(e: { key?: string; keyCode: number }, current: number, last: number, endJump?: boolean, now?: number): { handled: boolean; to: number | null };
}

/** One list's paging state: which key is down and since when. */
export function createPager(clock: () => number = Date.now): Pager {
  let code = 0;
  let at = 0;
  return {
    down(e) {
      if (!config.enabled || pagingDirection(e) === 0) return false;
      if (code !== e.keyCode) { code = e.keyCode; at = clock(); }
      return true;
    },
    up(e, current, last, endJump = true, now = clock()) {
      const dir = pagingDirection(e);
      if (!config.enabled || dir === 0 || code !== e.keyCode) return { handled: false, to: null };
      code = 0;
      const to = pagingTarget(dir, now - at >= CH_NAV_LONG_MS, current, last, config, endJump);
      return { handled: true, to: last >= 0 && to !== current ? to : null };
    },
  };
}
