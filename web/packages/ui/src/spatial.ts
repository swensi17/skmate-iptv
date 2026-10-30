export type Direction = "up" | "down" | "left" | "right";

export interface Box { id: string; x: number; y: number; w: number; h: number }

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/**
 * The box a D-pad press should land on: the nearest one lying in that direction, preferring boxes
 * that overlap the current one on the other axis so a list stays a list. Pure on purpose: it takes
 * rectangles, not elements, so it is tested without a browser and works the same on every TV.
 */
export function nextFocus(boxes: readonly Box[], currentId: string | null, dir: Direction): string | null {
  const cur = boxes.find((b) => b.id === currentId);
  if (!cur) return boxes[0]?.id ?? null;
  const c = centre(cur);
  let best: { id: string; score: number } | null = null;
  for (const b of boxes) {
    if (b.id === cur.id) continue;
    const p = centre(b);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const along = dir === "right" ? dx : dir === "left" ? -dx : dir === "down" ? dy : -dy;
    if (along <= 0) continue;
    const across = Math.abs(dir === "left" || dir === "right" ? dy : dx);
    const overlap = dir === "left" || dir === "right"
      ? Math.min(cur.y + cur.h, b.y + b.h) - Math.max(cur.y, b.y)
      : Math.min(cur.x + cur.w, b.x + b.w) - Math.max(cur.x, b.x);
    const score = along + across * (overlap > 0 ? 1 : 4);
    if (best === null || score < best.score) best = { id: b.id, score };
  }
  return best?.id ?? null;
}
