const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`";
const RU = "йцукенгшщзхъфывапролджэячсмитьбю.ё";

function pairs(from: string, to: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i < Math.min(from.length, to.length); i++) map[from[i] as string] = to[i] as string;
  return map;
}

const enToRu = pairs(EN, RU);
const ruToEn = pairs(RU, EN);

const isLat = (ch: string) => ch >= "a" && ch <= "z";
const isCyr = (ch: string) => (ch >= "а" && ch <= "я") || ch === "ё";

/** "ntktrfyfk" → "телеканал"; null when nothing in the text is a letter of either layout. */
export function swapped(s: string): string | null {
  let latin = 0;
  let cyrillic = 0;
  for (const ch of s) {
    if (isLat(ch)) latin++;
    else if (isCyr(ch)) cyrillic++;
  }
  if (latin === 0 && cyrillic === 0) return null;
  const map = latin >= cyrillic ? enToRu : ruToEn;
  let out = "";
  for (const ch of s) out += map[ch] ?? ch;
  return out;
}

const cyrToLatRu: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h",
};
/** The Uzbek Latin spelling: x for х, h for ҳ, j for ж, g for ғ. */
const cyrToLatUz: Record<string, string> = {
  ...cyrToLatRu, х: "x", ж: "j", ц: "s", ҳ: "h", ғ: "g", ў: "o", щ: "sh", й: "y",
};

const latToCyrRu: Array<[string, string]> = [
  ["shch", "щ"], ["sch", "щ"], ["sh", "ш"], ["ch", "ч"], ["zh", "ж"], ["kh", "х"], ["ts", "ц"],
  ["yu", "ю"], ["ya", "я"], ["yo", "е"], ["ye", "е"], ["iy", "ий"], ["yi", "ы"],
  ["a", "а"], ["b", "б"], ["c", "ц"], ["d", "д"], ["e", "е"], ["f", "ф"], ["g", "г"], ["h", "х"],
  ["i", "и"], ["j", "ж"], ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"], ["o", "о"], ["p", "п"],
  ["q", "к"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"], ["v", "в"], ["w", "в"], ["x", "кс"],
  ["y", "й"], ["z", "з"],
];
const latToCyrUz: Array<[string, string]> = [
  ["sh", "ш"], ["ch", "ч"], ["ng", "нг"], ["yu", "ю"], ["ya", "я"], ["yo", "ё"], ["ts", "ц"],
  ["a", "а"], ["b", "б"], ["d", "д"], ["e", "е"], ["f", "ф"], ["g", "г"], ["h", "ҳ"],
  ["i", "и"], ["j", "ж"], ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"], ["o", "о"], ["p", "п"],
  ["q", "қ"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"], ["v", "в"], ["x", "х"], ["y", "й"],
  ["z", "з"], ["c", "ц"], ["w", "в"],
];

export function toLatin(s: string, uzbek = false): string {
  const map = uzbek ? cyrToLatUz : cyrToLatRu;
  let out = "";
  for (const ch of s) out += map[ch] ?? ch;
  return out;
}

export function toCyrillic(s: string, uzbek = false): string {
  const table = uzbek ? latToCyrUz : latToCyrRu;
  let out = "";
  let i = 0;
  while (i < s.length) {
    const hit = table.find(([lat]) => s.startsWith(lat, i));
    if (hit) {
      out += hit[1];
      i += hit[0].length;
    } else {
      out += s[i];
      i++;
    }
  }
  return out;
}

export const hasLatin = (s: string) => Array.prototype.some.call(s, isLat) as boolean;
export const hasCyrillic = (s: string) =>
  Array.prototype.some.call(s, (c: string) => isCyr(c) || "ўқғҳ".includes(c)) as boolean;
