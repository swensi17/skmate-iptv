import type { Programme } from "@skmate/epg";

/*
 * The guide grid's arithmetic, ported from the Android app (features/epg/EpgScreen.kt, GuideCore.kt, GuideStage.kt):
 * the time axis, the cursor that ◀ ▶ move programme by programme, and the "one row of room" vertical step.
 * Pure: no DOM, no clock. Sizes are Android mpx = px of the 1728×972 stage.
 */

/** `GuideGridDefaults.PxPerMin`: 7.2 per minute, a half-hour slot is 216. */
export const PX_PER_MIN = 7.2;
/** `GuideGridDefaults.SlotMin`: ruler marks, and how close to an edge the cursor may come before the grid scrolls. */
export const SLOT_MIN = 30;
/** `.gcell` rows: 56 high, 6 apart. */
export const ROW_H = 56;
export const ROW_GAP = 6;
export const ROW_STEP = ROW_H + ROW_GAP;
/** Across a gap the cursor moves by half an hour, rather than leaping hours to the next programme. */
export const GAP_STEP_MS = 30 * 60_000;
/** `GUIDE_VISIBLE_PAST_MS`: two recent hours stay on the left of "now". */
export const VISIBLE_PAST_MS = 2 * 3_600_000;
const HALF_HOUR = 30 * 60_000;
const MIN_AHEAD_MS = 4 * 3_600_000;

export interface Window { start: number; end: number }

/** The grid's time window: two hours back from the half hour, forward to the last programme the guide holds. */
export function guideWindow(now: number, lastStop: number): Window {
  const aligned = Math.floor(now / HALF_HOUR) * HALF_HOUR;
  const end = Math.max(aligned + MIN_AHEAD_MS, Math.ceil(lastStop / HALF_HOUR) * HALF_HOUR);
  return { start: aligned - VISIBLE_PAST_MS, end };
}

/** Where [t] is on the timeline, from the window's start. */
export function pxAt(t: number, windowStart: number): number {
  return ((t - windowStart) / 60_000) * PX_PER_MIN;
}

/** The time at [px] on the timeline. */
export function timeAt(px: number, windowStart: number): number {
  return windowStart + Math.round((px / PX_PER_MIN) * 60_000);
}

/** The programme on at [t] in a row (sorted by start), or null in a stretch with nothing on. */
export function programmeAt(list: readonly Programme[], t: number): Programme | null {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = list[mid] as Programme;
    if (t < p.start) hi = mid - 1;
    else if (t >= p.stop) lo = mid + 1;
    else return p;
  }
  // Feeds can overlap: a linear look near the miss settles it.
  for (let i = Math.max(0, lo - 2); i < Math.min(list.length, lo + 2); i++) {
    const p = list[i] as Programme;
    if (p.start <= t && t < p.stop) return p;
  }
  return null;
}

/** Where ◀ ([dir] -1) or ▶ (+1) takes the cursor: programme by programme, half an hour at a time across gaps. */
export function cursorStep(list: readonly Programme[], cursor: number, dir: number, windowStart: number, windowEnd: number): number {
  const cur = programmeAt(list, cursor);
  let target: number;
  if (dir > 0) {
    const from = cur?.stop ?? cursor;
    const next = list.find((p) => p.start >= from && p.start > cursor) ?? null;
    if (cur !== null && (next === null || next.start - cur.stop > GAP_STEP_MS)) target = cur.stop;
    else if (cur !== null && next !== null) target = next.start;
    else if (next !== null && next.start - cursor <= GAP_STEP_MS) target = next.start;
    else target = cursor + GAP_STEP_MS;
  } else {
    const until = cur?.start ?? cursor;
    let prev: Programme | null = null;
    for (let i = list.length - 1; i >= 0; i--) { const p = list[i] as Programme; if (p.stop <= until) { prev = p; break; } }
    if (cur !== null && (prev === null || cur.start - prev.stop > GAP_STEP_MS)) target = cur.start - GAP_STEP_MS;
    else if (cur !== null && prev !== null) target = prev.start;
    else if (prev !== null && cursor - prev.stop <= GAP_STEP_MS) target = prev.start;
    else target = cursor - GAP_STEP_MS;
  }
  return Math.min(windowEnd - 1, Math.max(windowStart, target));
}

/** The horizontal scroll that keeps the cursor at [x] at least a slot inside the view, as `EpgScreen` does (instant). */
export function followCursor(x: number, scroll: number, viewW: number, maxScroll: number): number {
  const margin = SLOT_MIN * PX_PER_MIN;
  let next = scroll;
  if (x < scroll + margin) next = x - margin;
  else if (x > scroll + viewW - margin) next = x - viewW + margin;
  return Math.round(Math.min(maxScroll, Math.max(0, next)));
}

/** The vertical scroll after a step to row [i]: just enough that one more row shows beyond it (`stepTo`). */
export function stepScroll(i: number, scroll: number, viewH: number, maxScroll: number): number {
  const top = i * ROW_STEP - scroll;
  let next = scroll;
  if (top - ROW_STEP < 0) next = i * ROW_STEP - ROW_STEP;
  else if (top + ROW_H + ROW_STEP > viewH) next = i * ROW_STEP + ROW_H + ROW_STEP - viewH;
  return Math.min(maxScroll, Math.max(0, next));
}

/** A programme as one cell of the strip: where it is drawn on the timeline, its text and what it is. */
export interface Cell { p: Programme; x: number; w: number }

/**
 * The cells of one row that reach into [from, to) on the timeline (px), each drawn from where the one before it ends,
 * so two programmes for the same time never sit on top of each other (`ProgrammeStripCanvas`): 3 in, 6 apart.
 */
export function cellsIn(list: readonly Programme[], windowStart: number, windowEnd: number, from: number, to: number): Cell[] {
  const out: Cell[] = [];
  const tFrom = timeAt(from, windowStart);
  // The first programme that may reach the view: one before the first that ends after [tFrom] (for the overlap rule).
  let lo = 0;
  let hi = list.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if ((list[mid] as Programme).stop <= tFrom) lo = mid + 1; else hi = mid; }
  let shownUntil = windowStart;
  for (let i = Math.max(0, lo - 1); i < list.length; i++) {
    const p = list[i] as Programme;
    const s0 = Math.max(shownUntil, Math.min(windowEnd, Math.max(windowStart, p.start)));
    const e0 = Math.min(windowEnd, Math.max(windowStart, p.stop));
    if (e0 <= s0) continue;
    shownUntil = e0;
    const x = pxAt(s0, windowStart) + 3;
    const w = ((e0 - s0) / 60_000) * PX_PER_MIN - 6;
    if (x >= to) break;
    if (w <= 0 || x + w <= from) continue;
    out.push({ p, x, w });
  }
  return out;
}

/** The stretch with nothing on around [t] (the cursor in a gap), clamped to the window. */
export function gapAround(list: readonly Programme[], t: number, windowStart: number, windowEnd: number): [number, number] {
  let start = windowStart;
  let end = windowEnd;
  for (const p of list) {
    if (p.stop <= t) start = Math.max(start, p.stop);
    else if (p.start > t) { end = Math.min(end, p.start); break; }
  }
  return [start, end];
}
