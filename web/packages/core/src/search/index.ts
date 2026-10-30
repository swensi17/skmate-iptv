import { normalize } from "./text";
import { QueryVariants } from "./variants";
import { score } from "./rank";

export { normalize, words } from "./text";
export * from "./layouts";
export { QueryVariants, MAX_VARIANTS } from "./variants";
export { Rank, score, allowedEdits, damerauLevenshtein, FUZZY_MIN_WORD } from "./rank";

export interface Ranked<T> { item: T; rank: number }

/** Items whose name answers the query, best matches first, ties keep their original order. */
export function searchBy<T>(items: readonly T[], query: string, nameOf: (item: T) => string): Ranked<T>[] {
  const variants = QueryVariants.of(query);
  if (variants.all.length === 0) return [];
  const hits: Array<Ranked<T> & { at: number }> = [];
  items.forEach((item, at) => {
    const rank = score(normalize(nameOf(item)), variants.all);
    if (rank !== null) hits.push({ item, rank, at });
  });
  hits.sort((a, b) => a.rank - b.rank || a.at - b.at);
  return hits.map(({ item, rank }) => ({ item, rank }));
}
