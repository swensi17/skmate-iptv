const APOSTROPHES = "'’‘ʻʼ`´";
const BREVE = "̆";

function isLetterOrDigit(ch: string): boolean {
  return ch.toLowerCase() !== ch.toUpperCase() || (ch >= "0" && ch <= "9");
}

function isMark(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (c >= 0x0300 && c <= 0x036f) || (c >= 0x1ab0 && c <= 0x1aff) || (c >= 0x20d0 && c <= 0x20ff);
}

/** Lower case, ё as е, no accents, no apostrophes, one space between words. */
export function normalize(s: string): string {
  const lower = s.toLowerCase().replace(/ё/g, "е");
  const decomposed = lower.normalize("NFD");
  let out = "";
  let pendingSpace = false;
  for (const ch of decomposed) {
    if (isMark(ch)) {
      // NFD splits й into и + breve and ў into у + breve; those are letters of their own, not accents.
      if (ch === BREVE && out.length > 0) {
        const last = out[out.length - 1];
        if (last === "и") out = out.slice(0, -1) + "й";
        else if (last === "у") out = out.slice(0, -1) + "ў";
      }
      continue;
    }
    if (APOSTROPHES.includes(ch)) continue;
    if (isLetterOrDigit(ch)) {
      if (pendingSpace && out.length > 0) out += " ";
      pendingSpace = false;
      out += ch;
    } else {
      pendingSpace = true;
    }
  }
  return out;
}

/** The words of a normalized string. */
export function words(normalized: string): string[] {
  return normalized === "" ? [] : normalized.split(" ");
}
