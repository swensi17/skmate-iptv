export interface Window { first: number; last: number }

/** The rows to draw for a viewport scrolled to [top]: the visible ones plus a few either side, so the D-pad always has a neighbour to land on. */
export function visibleWindow(top: number, viewport: number, rowHeight: number, count: number, buffer = 3): Window {
  if (count <= 0) return { first: 0, last: -1 };
  const first = Math.max(0, Math.floor(top / rowHeight) - buffer);
  const last = Math.min(count - 1, Math.ceil((top + viewport) / rowHeight) + buffer);
  return { first, last };
}

/** The scroll position that brings row [index] fully into view with the least movement. */
export function revealTop(top: number, index: number, rowHeight: number, viewport: number, count: number): number {
  const rowTop = index * rowHeight;
  const rowBottom = rowTop + rowHeight;
  let next = top;
  if (rowTop < top) next = rowTop;
  else if (rowBottom > top + viewport) next = rowBottom - viewport;
  return Math.max(0, Math.min(next, Math.max(0, count * rowHeight - viewport)));
}

/** A row [delta] steps away, kept inside the list. */
export function clampIndex(index: number, delta: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index + delta));
}
