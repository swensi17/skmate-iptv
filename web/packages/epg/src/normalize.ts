/**
 * Name normalisation for guide matching, ported from the Android app's EpgMatcher: it strips what IPTV names
 * carry besides the name (quality tags, country brackets, separators) so "DE| FUSS-TV 3 [HD]" and
 * "fusstv3.de" reduce to tokens that can be compared.
 */

// Cosmetic tokens that say nothing about which channel this is.
const NOISE = new Set([
  "hd", "fhd", "uhd", "sd", "4k", "8k", "hq", "lq", "hevc", "h265", "h264", "fps", "raw", "vip", "backup", "feed", "alt",
  "1080p", "1080", "720p", "720", "480p", "540p", "2160p", "fullhd", "multi", "multisub", "latino",
]);

// Country tags names carry at an end ("DE| …", "… UK"); stripped only at the ends, never mid-name.
const COUNTRY = new Set([
  "us", "uk", "ca", "au", "nz", "ie", "za", "in", "pk", "de", "at", "ch", "fr", "es", "pt", "it", "nl", "be", "lu",
  "pl", "cz", "sk", "hu", "ro", "bg", "gr", "tr", "ru", "ua", "se", "no", "dk", "fi", "is", "ee", "lv", "lt", "hr", "rs", "si",
  "br", "mx", "ar", "cl", "co", "pe", "ve", "ae", "sa", "qa", "eg", "usa", "america", "canada", "australia", "ireland",
  "england", "scotland", "wales", "france", "germany", "deutschland", "austria", "switzerland", "spain", "espana", "italy",
  "italia", "portugal", "netherlands", "holland", "belgium", "poland", "polska", "czech", "czechia", "slovakia", "hungary",
  "romania", "bulgaria", "greece", "turkey", "turkiye", "russia", "ukraine", "sweden", "norway", "denmark", "finland",
  "iceland", "croatia", "serbia", "slovenia", "brazil", "brasil", "mexico", "argentina", "chile", "colombia", "peru",
  "venezuela", "egypt", "arabia", "arabic",
]);

// Spelled-out numbers become digits so "BBC One" and "BBC 1" compare equal.
const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
};

const BRACKETS = /[[({][^\])}]*[\])}]/g;
const SEPARATORS = /[._\-:|/+]/g;

const isAlnum = (ch: string) => ch.toLowerCase() !== ch.toUpperCase() || (ch >= "0" && ch <= "9");
const hasLetter = (s: string) => Array.from(s).some((c) => c.toLowerCase() !== c.toUpperCase());

const CACHE_MAX = 4096;
const cache = new Map<string, string>();

export function normalizeForEpg(raw: string): string {
  const hit = cache.get(raw);
  if (hit !== undefined) return hit;
  const value = normalizeUncached(raw);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(raw, value);
  return value;
}

function normalizeUncached(raw: string): string {
  // NFKC folds decorative spellings ("ᴴᴰ" becomes "HD", which is then noise) and keeps "й" and "ё" whole.
  let s = raw.normalize("NFKC").toLowerCase().replace(BRACKETS, " ").replace(SEPARATORS, " ");
  s = Array.from(s).map((c) => (isAlnum(c) ? c : " ")).join("");
  const tokens = s.split(/\s+/).filter((t) => t !== "" && !NOISE.has(t)).map((t) => NUMBER_WORDS[t] ?? t);
  // A country tag at an end goes, but only if a wordy token remains: "France 24" stays "france 24".
  const canDrop = (i: number) => tokens.length > 1 && COUNTRY.has(tokens[i] as string) && tokens.some((t, j) => j !== i && hasLetter(t));
  if (canDrop(0)) tokens.shift();
  if (tokens.length > 0 && canDrop(tokens.length - 1)) tokens.pop();
  return tokens.join(" ").trim();
}
