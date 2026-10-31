import { words } from "./text";

export const Rank = { EXACT: 0, PREFIX: 1, WORD_PREFIX: 2, SUBSTRING: 3, FUZZY: 4, OTHER: 5 } as const;
export const FUZZY_MIN_WORD = 4;

/** Typos allowed in a word of a given length: one from four letters, two from eight. */
export function allowedEdits(len: number): number {
  return len >= 8 ? 2 : len >= FUZZY_MIN_WORD ? 1 : 0;
}

/** Edit distance counting a swap of two neighbours as one edit, cut off at max + 1. */
export function damerauLevenshtein(a: string, b: string, max = Number.MAX_SAFE_INTEGER): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prevPrev = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, (prevPrev[j - 2] as number) + 1);
      }
      cur[j] = d;
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > max) return max + 1;
    const t = prevPrev;
    prevPrev = prev;
    prev = cur;
    cur = t;
  }
  return prev[b.length] as number;
}

function prefixDistance(q: string, w: string, max: number): number {
  if (w.length <= q.length) return max + 1;
  return damerauLevenshtein(q, w.slice(0, Math.min(w.length, q.length + max)), max);
}

function allWordsPrefix(nameWords: string[], v: string): boolean {
  const qs = words(v);
  return qs.length > 1 && qs.every((q) => nameWords.some((w) => w.startsWith(q)));
}

function allWordsFuzzy(nameWords: string[], v: string): boolean {
  const qs = words(v);
  if (qs.length === 0) return false;
  return qs.every((q) => {
    const max = allowedEdits(q.length);
    return nameWords.some(
      (w) => w.startsWith(q) || (max > 0 && (damerauLevenshtein(q, w, max) <= max || prefixDistance(q, w, max) <= max)),
    );
  });
}

/** How well a name answers the typed text: the smaller the better, null when it does not at all. */
export function score(normalizedName: string, variants: readonly string[], nameWords: string[] = words(normalizedName)): number | null {
  let best: number | null = null;
  for (const v of variants) {
    let s: number | null;
    if (normalizedName === v) s = Rank.EXACT;
    else if (normalizedName.startsWith(v)) s = Rank.PREFIX;
    else if (nameWords.some((w) => w.startsWith(v))) s = Rank.WORD_PREFIX;
    else if (normalizedName.includes(v)) s = Rank.SUBSTRING;
    else if (allWordsPrefix(nameWords, v)) s = Rank.WORD_PREFIX;
    else if (allWordsFuzzy(nameWords, v)) s = Rank.FUZZY;
    else s = null;
    if (s !== null && (best === null || s < best)) best = s;
    if (best === Rank.EXACT) break;
  }
  return best;
}
