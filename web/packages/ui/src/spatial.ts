export type Direction = "up" | "down" | "left" | "right";

export interface Box { id: string; x: number; y: number; w: number; h: number }

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Left and Right may reach a box only this far above or below the line (boxes that just touch it). */
const NEAR = 8;

/**
 * The box a D-pad press should land on. Pure on purpose: it takes rectangles, not elements, so it is tested without a
 * browser and works the same on every TV.
 *
 * - Only boxes whose centre lies in that direction count.
 * - Distances are measured between edges, not centres: Down from a wide row lands on the small tab right under it,
 *   not on the next wide row whose centre happens to be closer.
 * - Boxes that share the line (overlap on the other axis) win; among them the one most aligned with the current box.
 * - Left and Right stay on the line: they never jump to a far box above or below (a dead end is better than focus
 *   leaping across the screen). Up and Down may go to the nearest box off the line when nothing is under it.
 */
export function nextFocus(boxes: readonly Box[], currentId: string | null, dir: Direction): string | null {
  const cur = boxes.find((b) => b.id === currentId);
  if (!cur) return boxes[0]?.id ?? null;
  const c = centre(cur);
  const horizontal = dir === "left" || dir === "right";
  let best: { id: string; score: number } | null = null;
  for (const b of boxes) {
    if (b.id === cur.id) continue;
    const p = centre(b);
    const along = dir === "right" ? p.x - c.x : dir === "left" ? c.x - p.x : dir === "down" ? p.y - c.y : c.y - p.y;
    if (along <= 0) continue;
    // The empty room between the two boxes in that direction (0 when they touch or overlap).
    const gap = Math.max(0, dir === "right" ? b.x - (cur.x + cur.w) : dir === "left" ? cur.x - (b.x + b.w)
      : dir === "down" ? b.y - (cur.y + cur.h) : cur.y - (b.y + b.h));
    const overlap = horizontal
      ? Math.min(cur.y + cur.h, b.y + b.h) - Math.max(cur.y, b.y)
      : Math.min(cur.x + cur.w, b.x + b.w) - Math.max(cur.x, b.x);
    // How far off the line the box is: 0 when it shares it, else the room between them on the other axis.
    const off = overlap > 0 ? 0 : -overlap;
    if (horizontal && off > NEAR) continue;
    // Among boxes on the line: the one whose start is closest to the current one's (lists are left-aligned, rows of
    // buttons top-aligned), as a small tie-break only.
    const align = horizontal ? Math.abs(b.y - cur.y) : Math.abs(b.x - cur.x);
    const score = gap + off * 4 + (off > 0 ? 1000 : 0) + align * 0.01;
    if (best === null || score < best.score) best = { id: b.id, score };
  }
  return best?.id ?? null;
}
