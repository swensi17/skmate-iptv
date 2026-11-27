import { scoped } from "./scope";

/*
 * Home categories the viewer hid or put in their own order (Android: LiveViewModel hideCategory / moveCategory /
 * restoreCategory, kept in the customization store per profile and media type). The web keeps the provider groups'
 * names; a playlist that no longer has a name simply ignores it.
 */
const KEY = "skmate.liveCategories.v1";

export interface CategoryState { hidden: string[]; order: string[] }

export const EMPTY: CategoryState = { hidden: [], order: [] };

export function loadCategories(): CategoryState {
  try {
    const raw = JSON.parse(localStorage.getItem(scoped(KEY)) ?? "null") as Partial<CategoryState> | null;
    const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    return { hidden: list(raw?.hidden), order: list(raw?.order) };
  } catch { return EMPTY; }
}

export function saveCategories(s: CategoryState): void {
  try { localStorage.setItem(scoped(KEY), JSON.stringify(s)); } catch { /* kept for this session only */ }
}

export function hideCategory(s: CategoryState, name: string): CategoryState {
  return s.hidden.includes(name) ? s : { ...s, hidden: [...s.hidden, name] };
}

/** [names] without the hidden ones, the saved order first (names it does not know keep their place after them). */
export function arrangeCategories<T extends { name: string }>(items: readonly T[], s: CategoryState): T[] {
  const shown = items.filter((x) => !s.hidden.includes(x.name));
  if (s.order.length === 0) return shown;
  const rank = new Map(s.order.map((n, i) => [n, i]));
  return shown.map((x, i) => ({ x, i })).sort((a, b) => (rank.get(a.x.name) ?? 1e9) - (rank.get(b.x.name) ?? 1e9) || a.i - b.i).map((v) => v.x);
}

/** MoveOrderOverlay.goTo: the carried row goes to [to]; same list when nothing changes. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list.slice();
  const out = list.slice();
  out.splice(to, 0, out.splice(from, 1)[0] as T);
  return out;
}

/** What "Restore to playlist default" would undo (CategoryRestorePlan): hidden ones show again, the order is cleared. */
export function restorePlan(s: CategoryState): { hidden: number; order: boolean } {
  return { hidden: s.hidden.length, order: s.order.length > 0 };
}
export const restoreAll = (): CategoryState => EMPTY;
