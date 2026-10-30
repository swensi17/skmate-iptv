import { hasCyrillic, hasLatin, swapped, toCyrillic, toLatin } from "./layouts";
import { normalize } from "./text";

export const MAX_VARIANTS = 6;

/** The spellings a typed query may have meant, each normalized, the typed one first. */
export class QueryVariants {
  constructor(readonly typed: string, readonly all: string[]) {}

  static of(query: string): QueryVariants {
    const typed = normalize(query);
    if (typed === "") return new QueryVariants(typed, []);
    const out = new Set<string>([typed]);
    const sw = swapped(typed);
    if (sw !== null) out.add(normalize(sw));
    for (const c of Array.from(out)) {
      if (hasCyrillic(c)) {
        out.add(normalize(toLatin(c)));
        out.add(normalize(toLatin(c, true)));
      }
      if (hasLatin(c)) {
        out.add(normalize(toCyrillic(c)));
        out.add(normalize(toCyrillic(c, true)));
      }
    }
    return new QueryVariants(typed, Array.from(out).filter((v) => v !== "").slice(0, MAX_VARIANTS));
  }
}
