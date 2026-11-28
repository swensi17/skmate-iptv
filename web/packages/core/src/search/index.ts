import { normalize, words } from "./text";
import { QueryVariants } from "./variants";
import { score } from "./rank";

export { normalize, words } from "./text";
export * from "./layouts";
export { QueryVariants, MAX_VARIANTS } from "./variants";
export { Rank, score, allowedEdits, damerauLevenshtein, FUZZY_MIN_WORD } from "./rank";

export interface Ranked<T> { item: T; rank: number }

/**
 * Names normalized once, searched many times: a playlist of thousands of channels is searched on every
 * key press, and a TV's processor is far slower than a laptop's, so the per-name work is done up front.
 */
export class SearchIndex<T> {
  private readonly names: string[];
  private readonly parts: string[][];

  constructor(private readonly items: readonly T[], nameOf: (item: T) => string) {
    this.names = items.map((i) => normalize(nameOf(i)));
    this.parts = this.names.map((n) => words(n));
  }

  /**
   * The same result as [search], worked out in short slices: [pause] is awaited after each [sliceMs] of work, so the screen
   * and the remote stay alive while thousands of names are read (a TV takes seconds for one pass). Resolves null when
   * [cancelled] turns true (another query was asked meanwhile).
   */
  async searchSliced(query: string, pause: () => Promise<void>, opts: { sliceMs?: number; cancelled?: () => boolean; limit?: number } = {}): Promise<Ranked<T>[] | null> {
    const variants = QueryVariants.of(query);
    if (variants.all.length === 0) return [];
    const clock = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
    const budget = opts.sliceMs ?? 8;
    const hits: Array<{ at: number; rank: number }> = [];
    let at = 0;
    while (at < this.names.length) {
      if (opts.cancelled?.()) return null;
      const t0 = clock();
      do {
        const rank = score(this.names[at] as string, variants.all, this.parts[at] as string[]);
        if (rank !== null) hits.push({ at, rank });
        at++;
      } while (at < this.names.length && clock() - t0 < budget); // at least one name per turn, so a zero budget still ends
      if (at < this.names.length) await pause();
    }
    if (opts.cancelled?.()) return null;
    hits.sort((a, b) => a.rank - b.rank || a.at - b.at);
    return hits.slice(0, opts.limit ?? Number.MAX_SAFE_INTEGER).map(({ at: i, rank }) => ({ item: this.items[i] as T, rank }));
  }

  /** Items whose name answers the query, best matches first, ties keep their original order. */
  search(query: string, limit = Number.MAX_SAFE_INTEGER): Ranked<T>[] {
    const variants = QueryVariants.of(query);
    if (variants.all.length === 0) return [];
    const hits: Array<{ at: number; rank: number }> = [];
    for (let at = 0; at < this.names.length; at++) {
      const rank = score(this.names[at] as string, variants.all, this.parts[at] as string[]);
      if (rank !== null) hits.push({ at, rank });
    }
    hits.sort((a, b) => a.rank - b.rank || a.at - b.at);
    return hits.slice(0, limit).map(({ at, rank }) => ({ item: this.items[at] as T, rank }));
  }
}

/** One-off search without keeping an index. */
export function searchBy<T>(items: readonly T[], query: string, nameOf: (item: T) => string): Ranked<T>[] {
  return new SearchIndex(items, nameOf).search(query);
}
