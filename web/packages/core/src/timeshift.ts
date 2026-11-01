// Live timeshift: pausing and winding the live picture, as on the Android app. There the stream is copied
// to the device; in a browser the buffer is what the player can already seek in (the stream's own DVR
// window plus what was downloaded), so the same keys work within that, and a channel with an archive can
// also start the programme on air from its beginning. Pure arithmetic, in seconds of the media timeline.

import { forM3u, type ArchiveChannel } from "./catchup";

/** Closer to the live edge than this counts as live: a live player always runs a few seconds behind. */
export const LIVE_EDGE_S = 12;

/** One press of Left or Right, as on the Android player. */
export const SEEK_STEP_S = 30;

/** What can be sought in now: the first and last second, or null when nothing yet. */
export interface SeekWindow { start: number; end: number }

/** The picture was at the live edge at media time [media] when the wall clock read [wall] (both seconds). */
export interface LiveAnchor { wall: number; media: number }

/**
 * How far behind live the picture is, in whole seconds, by the clock: the wall time since the picture was
 * last at the edge minus the media time played since. A pause, a wind back or a stall all count, on every
 * engine (the TV's own decoder does not say where its live edge is). 0 within [LIVE_EDGE_S].
 */
export function lagBehind(anchor: LiveAnchor | null, wall: number, current: number): number {
  if (!anchor) return 0;
  const lag = (wall - anchor.wall) - (current - anchor.media);
  return lag > LIVE_EDGE_S ? Math.round(lag) : 0;
}

/** How far behind the live edge [current] is, in whole seconds; 0 at the edge. */
export function behindLive(window: SeekWindow | null, current: number): number {
  if (!window) return 0;
  const behind = window.end - current;
  return behind > LIVE_EDGE_S ? Math.round(behind) : 0;
}

/**
 * Where a press of [byS] seconds from [current] lands, kept inside [window] and a few seconds short of its
 * end (the very last second has no data yet). `atStart`: the oldest buffered second was reached, so going
 * further back is only possible from the archive.
 */
export function windTo(window: SeekWindow | null, current: number, byS: number): { time: number; atStart: boolean } {
  if (!window) return { time: current, atStart: false };
  const newest = Math.max(window.start, window.end - 3);
  const target = Math.min(newest, Math.max(window.start, current + byS));
  return { time: target, atStart: target <= window.start + 0.5 && byS < 0 };
}

/** The programme on air on a channel that keeps an archive: it can be watched from its start. */
export function canStartOver(channel: ArchiveChannel, startMs: number, stopMs: number, nowMs: number = Date.now()): boolean {
  return (channel.catchupDays ?? 0) > 0 && startMs <= nowMs && nowMs < stopMs;
}

/**
 * The address that plays the programme on air from its beginning, from the provider's archive; null when
 * the channel keeps none. The same rules as a past programme (see catchup.ts), with the programme's own end.
 */
export function startOverUrl(channel: ArchiveChannel, startMs: number, stopMs: number, nowMs: number = Date.now(), tz?: string): string | null {
  if (!canStartOver(channel, startMs, stopMs, nowMs)) return null;
  const built = forM3u(channel.url, channel.catchupType, channel.catchupSource, startMs, stopMs, tz, channel.catchupCorrectionMin ?? 0, nowMs);
  if (built !== null) return built;
  if (channel.catchupType === undefined && channel.catchupSource === undefined) {
    return forM3u(channel.url, "xc", undefined, startMs, stopMs, tz, channel.catchupCorrectionMin ?? 0, nowMs);
  }
  return null;
}
