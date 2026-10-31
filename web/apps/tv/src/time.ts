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
