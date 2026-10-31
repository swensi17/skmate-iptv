/** "05:30" in the viewer's own time zone. */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The start of the half hour at or before [ms]. */
export function floorHalfHour(ms: number): number {
  const half = 30 * 60_000;
  return Math.floor(ms / half) * half;
}

/** What is left of a programme in words: "осталось 24 мин", "осталось 1 ч 05 мин"; "" when it is over. */
export function left(ms: number): { h: number; m: number } | null {
  if (ms <= 0) return null;
  const total = Math.ceil(ms / 60_000);
  return { h: Math.floor(total / 60), m: total % 60 };
}
