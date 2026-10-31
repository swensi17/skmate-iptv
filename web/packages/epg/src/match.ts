import { normalizeForEpg } from "./normalize";

/** At or above this a name match is trusted without a person looking at it (as in the Android app). */
export const AUTO_THRESHOLD = 0.92;
/** At or above this a match is worth showing for review; below it is ignored. */
export const REVIEW_THRESHOLD = 0.74;
const DIGIT_MISMATCH_CAP = 0.6; // "MTV 2" vs "MTV 3" can never match
const DIGIT_MISSING_CAP = 0.9; // a number on one side only stays below auto-apply

function jaro(a: string, b: string): number {
  const dist = Math.max(a.length, b.length) / 2 - 1;
  const aM = new Array<boolean>(a.length).fill(false);
  const bM = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - Math.floor(dist));
    const end = Math.min(i + Math.floor(dist) + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bM[j] || a[i] !== b[j]) continue;
      aM[i] = true; bM[j] = true; matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aM[i]) continue;
    while (!bM[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  return (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
}

/** Jaro–Winkler: tolerant of typos, biased toward a shared start. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (a === "" || b === "") return 0;
  const j = jaro(a, b);
  let prefix = 0;
  const max = Math.min(4, a.length, b.length);
  while (prefix < max && a[prefix] === b[prefix]) prefix++;
  return j + prefix * 0.1 * (1 - j);
}

function tokenDice(a: string, b: string): number {
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  ta.forEach((t) => { if (tb.has(t)) inter++; });
  return (2 * inter) / (ta.size + tb.size);
}

/** Sorted digit runs without leading zeros: "MTV 02" and "mtv2" both give ["2"]. */
export function digitRuns(s: string): string[] {
  return (s.match(/[0-9]+/g) ?? []).map((d) => d.replace(/^0+/, "") || "0").sort();
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Similarity 0..1 of two normalised names, capped when their channel numbers disagree. */
export function scoreNormalized(a: string, b: string): number {
  if (a === "" || b === "") return 0;
  if (a === b) return 1;
  let score = Math.max(jaroWinkler(a, b), tokenDice(a, b));
  const da = digitRuns(a);
  const db = digitRuns(b);
  if (!same(da, db)) score = Math.min(score, da.length > 0 && db.length > 0 ? DIGIT_MISMATCH_CAP : DIGIT_MISSING_CAP);
  return score;
}

export interface GuideCandidate { id: string; name?: string | undefined }
export interface Match { id: string; score: number }

interface Prepared { id: string; normName: string; normId: string; digitsName: string[]; digitsId: string[] }

/** Words that block too many candidates to be a useful key: single characters and bare numbers. */
const weakKey = (t: string) => t.length < 2 || /^[0-9]+$/.test(t);

/**
 * The guide's channels, indexed by the words of their names so a channel is compared with the few guide
 * channels that share a word (or a three-letter start) with it, not with the whole guide. The Android app does
 * every pair across all cores; a TV has neither the cores nor the time (3000 channels × 2000 guide entries).
 */
export class GuideIndex {
  private readonly items: Prepared[];
  private readonly byKey = new Map<string, number[]>();
  private readonly exact = new Map<string, number>();

  constructor(candidates: readonly GuideCandidate[]) {
    this.items = candidates.map((c) => {
      const normName = c.name ? normalizeForEpg(c.name) : "";
      const normId = normalizeForEpg(c.id);
      return { id: c.id, normName, normId, digitsName: digitRuns(normName), digitsId: digitRuns(normId) };
    });
    this.items.forEach((it, i) => {
      if (it.normName !== "" && !this.exact.has(it.normName)) this.exact.set(it.normName, i);
      for (const text of [it.normName, it.normId]) {
        for (const t of text.split(" ")) {
          if (t === "") continue;
          this.add(t, i);
          if (t.length >= 4) this.add(`^${t.slice(0, 3)}`, i);
        }
      }
    });
  }

  private add(key: string, index: number) {
    const list = this.byKey.get(key);
    if (!list) this.byKey.set(key, [index]);
    else if (list[list.length - 1] !== index) list.push(index);
  }

  /** The best guide channel for [channelName], or null when nothing reaches [minScore]. */
  best(channelName: string, minScore: number = AUTO_THRESHOLD): Match | null {
    const target = normalizeForEpg(channelName);
    if (target === "") return null;
    const exact = this.exact.get(target);
    if (exact !== undefined) return { id: (this.items[exact] as Prepared).id, score: 1 };
    const votes = new Map<number, number>();
    const tokens = target.split(" ");
    for (const t of tokens) {
      const keys = [weakKey(t) && tokens.length > 1 ? "" : t, t.length >= 4 ? `^${t.slice(0, 3)}` : ""];
      for (const k of keys) {
        if (k === "") continue;
        for (const i of this.byKey.get(k) ?? []) votes.set(i, (votes.get(i) ?? 0) + 1);
      }
    }
    // The candidates sharing the most words come first; far fewer than the guide, but never zero for a real match.
    const ranked = Array.from(votes).sort((x, y) => y[1] - x[1]).slice(0, 250);
    let best: Match | null = null;
    for (const [i] of ranked) {
      const it = this.items[i] as Prepared;
      const byName = it.normName === "" ? 0 : scoreWithDigits(target, it.normName, it.digitsName);
      const byId = scoreWithDigits(target, it.normId, it.digitsId);
      const score = Math.max(byName, byId);
      if (score >= minScore && (best === null || score > best.score)) best = { id: it.id, score };
      if (score === 1) break;
    }
    return best;
  }
}

function scoreWithDigits(target: string, other: string, otherDigits: string[]): number {
  if (target === "" || other === "") return 0;
  if (target === other) return 1;
  let score = Math.max(jaroWinkler(target, other), tokenDice(target, other));
  const dt = digitRuns(target);
  if (!same(dt, otherDigits)) score = Math.min(score, dt.length > 0 && otherDigits.length > 0 ? DIGIT_MISMATCH_CAP : DIGIT_MISSING_CAP);
  return score;
}
