import { scoped } from "./scope";

const KEY = "skmate.queries.v1";
export const MAX_QUERIES = 8;

/** A finished search goes to the front of the remembered ones (a repeat moves up, it is not added twice). */
export function pushQuery(list: readonly string[], query: string, max = MAX_QUERIES): string[] {
  const q = query.trim();
  if (q.length < 2) return [...list];
  const lower = q.toLowerCase();
  return [q, ...list.filter((x) => x.toLowerCase() !== lower)].slice(0, max);
}

export function loadQueries(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(scoped(KEY)) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, MAX_QUERIES) : [];
  } catch {
    return [];
  }
}

export function saveQueries(list: readonly string[]): void {
  try { localStorage.setItem(scoped(KEY), JSON.stringify(list)); } catch { /* not remembered */ }
}
