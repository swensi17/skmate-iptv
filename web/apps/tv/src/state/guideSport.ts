import { SearchIndex, normalize, type Channel } from "@skmate/core";
import type { GuideData, Programme } from "@skmate/epg";

/*
 * Sport on the user's channels, from the guide, as the Android app finds it (engine/core/.../sports/SportOnChannels.kt)
 * and as its Sports board sorts and filters it (SportsBoardFilter.kt). Local only: the guide and the playlist.
 * No `\p{…}` regular expressions: a 2019 TV (Chromium 63) does not know them.
 */

/** A sport as a guide files it; the declaration order is the board's group order. OTHER = a fixture on a sports channel. */
export const GUIDE_SPORTS = [
  "FOOTBALL", "HANDBALL", "BASKETBALL", "TENNIS", "ICE_HOCKEY", "MOTORSPORT", "DARTS", "SNOOKER", "CYCLING", "CRICKET",
  "COMBAT", "AMERICAN_FOOTBALL", "BASEBALL", "GOLF", "RUGBY", "VOLLEYBALL", "ATHLETICS", "WINTER", "OTHER",
] as const;
export type GuideSport = (typeof GUIDE_SPORTS)[number];

/** One programme and every channel showing it. */
export interface GuideSportItem { sport: GuideSport; title: string; start: number; stop: number; channels: Channel[] }

export type BoardSort = "RELEVANCE" | "TIME" | "TITLE" | "CHANNEL";
export const BOARD_SORTS: readonly BoardSort[] = ["RELEVANCE", "TIME", "TITLE", "CHANNEL"];

/** Programmes on now, or starting within half an hour. */
export const SOON_MS = 30 * 60_000;
/** How long before now a programme may have started and still be on (a Test match day, a GP). */
const LOOKBACK_MS = 8 * 3_600_000;

type Words = Array<[GuideSport, readonly string[]]>;

// Guide words per sport, after folding (lower case, no accents), in several languages.
const WORDS: Words = [
  ["HANDBALL", ["handball", "balonmano", "pallamano", "hentbol", "hbl", "ehf"]],
  ["DARTS", ["darts", "dart", "pdc"]],
  ["SNOOKER", ["snooker"]],
  ["CYCLING", ["radsport", "cycling", "cyclisme", "ciclismo", "bisiklet", "radrennen"]],
  ["TENNIS", ["tennis", "tenis", "atp", "wta"]],
  ["BASKETBALL", ["basketball", "basket", "baloncesto", "basketbol", "nba", "euroleague", "bbl"]],
  ["ICE_HOCKEY", ["eishockey", "hockey", "nhl", "del", "hokey"]],
  ["MOTORSPORT", ["motorsport", "formel", "formula", "motogp", "nascar", "indycar", "rallye", "rally", "dtm", "superbike", "grand", "prix"]],
  ["CRICKET", ["cricket", "ipl", "odi"]],
  ["COMBAT", ["boxen", "boxing", "boxe", "boks", "ufc", "mma", "kickboxing", "wrestling", "wwe"]],
  ["AMERICAN_FOOTBALL", ["nfl", "superbowl", "ncaaf"]],
  ["BASEBALL", ["baseball", "mlb", "beisbol"]],
  ["GOLF", ["golf", "pga"]],
  ["RUGBY", ["rugby"]],
  ["VOLLEYBALL", ["volleyball", "volley", "voleibol", "voleybol", "pallavolo"]],
  ["ATHLETICS", ["leichtathletik", "athletics", "athletisme", "atletismo", "marathon"]],
  ["WINTER", ["biathlon", "skispringen", "ski", "langlauf", "bobsleigh", "rodeln"]],
  ["FOOTBALL", [
    "fussball", "fusball", "football", "soccer", "futbol", "calcio", "futebol", "voetbal",
    "bundesliga", "premier", "league", "laliga", "liga", "serie", "ligue", "champions", "europa", "pokal", "dfb", "uefa", "fifa", "super", "lig",
  ]],
];

// Russian guides write the sport out and decline it: stems matched against the start of a word.
const CYRILLIC_STEMS: Words = [
  ["AMERICAN_FOOTBALL", ["нфл"]],
  ["ICE_HOCKEY", ["хоккей", "кхл", "нхл", "вхл", "мхл"]],
  ["BASKETBALL", ["баскетбол", "втб", "нба"]],
  ["TENNIS", ["теннис"]],
  ["VOLLEYBALL", ["волейбол"]],
  ["HANDBALL", ["гандбол"]],
  ["COMBAT", ["бокс", "единоборств", "смешанные единоборства", "рестлинг", "кикбокс"]],
  ["MOTORSPORT", ["формула", "мотогп", "автоспорт", "ралли", "автогонк", "супербайк"]],
  ["WINTER", ["биатлон", "лыжн", "фигурное катание", "конькобеж", "бобслей", "санн", "сноуборд", "прыжки с трамплина"]],
  ["ATHLETICS", ["легкая атлетика", "легкоатлет", "марафон"]],
  ["CYCLING", ["велоспорт", "велогонк"]],
  ["SNOOKER", ["снукер", "бильярд"]],
  ["DARTS", ["дартс"]],
  ["GOLF", ["гольф"]],
  ["RUGBY", ["регби"]],
  ["CRICKET", ["крикет"]],
  ["BASEBALL", ["бейсбол"]],
  ["FOOTBALL", ["футбол", "рпл", "фнл", "лига чемпионов", "лига европы", "кубок россии"]],
];

// "American football" is not football; "Formel 1" is not "1": these phrases decide first.
const PHRASES: Words = [
  ["AMERICAN_FOOTBALL", ["american football", "football americain", "futbol americano"]],
  ["WINTER", ["ski alpin", "alpine skiing", "ski jumping"]],
  ["ICE_HOCKEY", ["ice hockey"]],
  ["MOTORSPORT", ["formula 1", "formula one", "formel 1", "grand prix", "grosser preis"]],
];

const SPORT_CATEGORY = new Set(["sport", "sports", "deporte", "deportes", "spor", "esporte", "live sport", "спорт", "спортивные", "спортивный", "спортивная"]);
// A sport-word that alone is too common in other programmes' titles ("Grand Designs", "Super Size").
const WEAK = new Set(["grand", "prix", "super", "lig", "liga", "serie", "premier", "league", "europa", "champions", "formula", "basket", "del", "odi", "ski"]);

/** Letters and digits of the scripts a guide is written in (Latin with its accents, Greek, Cyrillic, …). */
/** `[a-b]` of two code points, built from numbers so the source stays plain ASCII. */
const span = (a: number, b: number) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`;
const NON_WORD = new RegExp(`[^0-9a-z${String.fromCharCode(0xb5)}${[[0xc0, 0x24f], [0x370, 0x3ff], [0x400, 0x52f], [0x590, 0x5ff], [0x600, 0x6ff], [0x900, 0xdff], [0xe00, 0xe7f], [0x3040, 0x30ff], [0x3400, 0x9fff], [0xac00, 0xd7af]].map(([a, b]) => span(a as number, b as number)).join("")}]+`);
const COMBINING = new RegExp(`[${span(0x300, 0x36f)}]+`, "g");
const DIGITS = /^[0-9]+$/;
const DOUBLED = /([^0-9])\1+/g;
const FIXTURE = /\S\s+(?:[-–—:]|v|vs\.?|gegen|contre|x)\s+\S/i;
const SPORTS_CHANNEL = /sport|спорт|матч|боец|окко|okko|кхл|khl|футбол|хоккей|единоборств|мяч|старт|dazn|eurosport|bein|espn|tsn|arena|eleven|setanta|tnt ?sport|premier ?sports|canal\+ ?(?:sport|foot)|movistar ?(?:deportes|liga)|dyn|magenta ?sport|sky ?sport|laliga ?tv|nba ?tv|nfl|mlb|nhl/i;
const HAS_CYRILLIC = new RegExp(`[${span(0x400, 0x4ff)}]`);

// TeamNames.tokens: club words that say nothing about which club, and city spellings mapped to one form.
const NOISE = new Set([
  "fc", "sc", "ac", "afc", "cf", "sv", "tsv", "tsg", "vfl", "fsv", "bsc", "bv", "sk", "fk", "nk",
  "ssc", "ss", "as", "us", "sd", "cd", "ud", "rc", "rcd", "ca", "club", "calcio", "futbol", "fussball",
  "de", "del", "la", "el", "al", "the", "and",
]);
const EXONYMS: Record<string, string> = {
  munchen: "munich", muenchen: "munich", koln: "cologne", koeln: "cologne", milano: "milan", torino: "turin", roma: "rome",
  napoli: "naples", firenze: "florence", genova: "genoa", venezia: "venice", lisboa: "lisbon", sevila: "seville", praha: "prague",
  wien: "vienna", bruxeles: "brusels", brusel: "brusels", moskva: "moscow", warszawa: "warsaw", kobenhavn: "copenhagen",
  goteborg: "gothenburg", beograd: "belgrade", bucuresti: "bucharest", nurnberg: "nuremberg", nuernberg: "nuremberg",
  deutschland: "germany", frankreich: "france", spanien: "spain", espana: "spain", italien: "italy", italia: "italy",
  turkiye: "turkey", turkei: "turkey", osterreich: "austria", schweiz: "switzerland", suisse: "switzerland",
  niederlande: "netherlands", holland: "netherlands", angleterre: "england", allemagne: "germany", alemania: "germany",
  inglaterra: "england", brasil: "brazil", brasilien: "brazil",
};

const umlautFolded = (s: string) => (s.length > 3 ? s.replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u") : s);

/** The distinctive tokens of [text]: accents folded, club noise and numbers dropped, doubled letters collapsed. */
export function tokens(text: string): string[] {
  const folded = text.replace(/ı/g, "i").replace(/ß/g, "s").normalize("NFKD").replace(COMBINING, "").toLowerCase();
  const out: string[] = [];
  for (const raw of folded.split(NON_WORD)) {
    if (raw === "" || DIGITS.test(raw)) continue;
    const t = raw.replace(DOUBLED, "$1");
    const mapped = (EXONYMS[t] ?? EXONYMS[umlautFolded(t)] ?? umlautFolded(t)).replace(DOUBLED, "$1");
    if (!NOISE.has(mapped)) out.push(mapped);
  }
  return out;
}

function cyrillicSport(words: string[], lower: string): GuideSport | null {
  if (lower.indexOf("американск") >= 0 && lower.indexOf("футбол") >= 0) return "AMERICAN_FOOTBALL";
  if (!words.some((w) => HAS_CYRILLIC.test(w))) return null;
  const folded = lower.replace(/ё/g, "е");
  for (const [sport, stems] of CYRILLIC_STEMS) {
    for (const stem of stems) {
      if (stem.indexOf(" ") >= 0) { if (folded.indexOf(stem) >= 0) return sport; }
      else if (words.some((w) => w.lastIndexOf(stem, 0) === 0)) return sport;
    }
  }
  return null;
}

/** The sport a programme is, from its categories and title; null when neither names one. */
export function sportOf(title: string, categories?: string | null): GuideSport | null {
  const text = [categories, title].filter((x): x is string => !!x).join(" ");
  const lower = text.toLowerCase();
  const raw = lower.split(NON_WORD).filter((w) => w !== "");
  const toks = tokens(text);
  const phrases = ` ${toks.join(" ")} | ${raw.join(" ")} `;
  for (const [sport, ps] of PHRASES) if (ps.some((p) => phrases.indexOf(` ${p} `) >= 0)) return sport;
  const cyr = cyrillicSport(raw, lower);
  if (cyr) return cyr;
  const all = new Set([...toks, ...raw]);
  const cat = categories ? tokens(categories) : [];
  const sportCat = cat.some((c) => SPORT_CATEGORY.has(c));
  for (const [sport, words] of WORDS) {
    if (words.some((w) => !WEAK.has(w) && all.has(w))) return sport;
    const hits = words.filter((w) => all.has(w)).length;
    if (hits > 0 && (sportCat || hits >= 2)) return sport;
  }
  return null;
}

export const isFixture = (title: string) => FIXTURE.test(title);
/** A channel (by name or guide id) that carries sport. */
export const isSportsChannel = (nameOrId: string) => SPORTS_CHANNEL.test(nameOrId);

/**
 * What is sport on the user's channels now (or within half an hour): by a sport word in the title, or a fixture
 * ("Kiel – Magdeburg") on a sports channel. One card per programme, with every channel showing it; sport order, then start.
 */
export function sportOnChannels(channels: readonly Channel[], data: GuideData, now: number): GuideSportItem[] {
  const groups = new Map<string, GuideSportItem>();
  const order: string[] = [];
  for (const c of channels) {
    const list = data.of(c.id);
    if (list.length === 0) continue;
    // The first programme still on at [now]; programmes are sorted by start.
    let lo = 0;
    let hi = list.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if ((list[mid] as Programme).stop <= now) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < list.length; i++) {
      const p = list[i] as Programme;
      if (p.start > now + SOON_MS) break;
      if (p.stop <= now || p.start < now - LOOKBACK_MS) continue;
      let sport = sportOf(p.title);
      // A Russian title names a sport in everyday words ("Маша и Медведь (Вот такой хоккей)"): it counts on a
      // sports channel only. A bare fixture counts only on a sports channel too.
      let needsSportsChannel = sport !== null && HAS_CYRILLIC.test(p.title);
      if (sport === null) {
        if (!isFixture(p.title)) continue;
        sport = "OTHER";
        needsSportsChannel = true;
      }
      if (needsSportsChannel && !isSportsChannel(c.name) && !isSportsChannel(data.links.get(c.id) ?? "")) continue;
      const title = p.title.trim();
      const key = `${title.toLowerCase()}|${p.start}`;
      const had = groups.get(key);
      if (had) { if (!had.channels.some((x) => x.id === c.id)) had.channels.push(c); continue; }
      groups.set(key, { sport, title, start: p.start, stop: p.stop, channels: [c] });
      order.push(key);
    }
  }
  const rank = (s: GuideSport) => GUIDE_SPORTS.indexOf(s);
  return order.map((k) => groups.get(k) as GuideSportItem).sort((a, b) => rank(a.sport) - rank(b.sport) || a.start - b.start);
}

// ---- The board's filters and orders (SportsBoardFilter) ----

const NOT_COUNTRY = new Set(["HD", "SD", "TV", "FM", "FHD", "UHD", "HQ", "LQ", "TW", "VIP", "PPV"]);
const TAIL = /(?:^|[\s|[(])([A-Z]{2})[\])]?\s*$/;
const HEAD = /^\s*[[(]?([A-Z]{2})[\])]?\s*[|:-]/;
const ALIASES: Record<string, string> = { UK: "GB", EN: "GB", EL: "GR", SR: "RS", SQ: "AL", UA: "UA" };
const TURKISH = /[ğĞıİşŞ]/;

/** The ISO country a channel name points to ("Cosmote Sport 2 HD GR" → GR, "Старт Триумф" → RU), or null. */
export function countryOfName(name: string): string | null {
  const m = HEAD.exec(name) ?? TAIL.exec(name);
  const code = m ? m[1] as string : null;
  if (code && !NOT_COUNTRY.has(code)) return ALIASES[code] ?? code;
  if (HAS_CYRILLIC.test(name)) return "RU";
  if (TURKISH.test(name)) return "TR";
  return null;
}

/** The country of an item: the first of its channels that names one. */
export function countryOf(item: GuideSportItem): string | null {
  for (const c of item.channels) { const k = countryOfName(c.name); if (k) return k; }
  return null;
}

/** Countries present, as codes: the caller sorts them by their names. */
export function countries(items: readonly GuideSportItem[]): string[] {
  const out: string[] = [];
  for (const it of items) { const k = countryOf(it); if (k && out.indexOf(k) < 0) out.push(k); }
  return out;
}

/** The countries a viewer who reads [language] most likely watches sport from, before their region. */
export function preferredCountries(language: string, region: string | null): Set<string> {
  const out = new Set<string>();
  const add = (...c: string[]) => c.forEach((x) => out.add(x));
  switch (language.toLowerCase()) {
    case "ru": add("RU"); break;
    case "uk": add("UA"); break;
    case "tr": add("TR"); break;
    case "uz": add("UZ", "RU"); break;
    case "kk": add("KZ", "RU"); break;
    case "de": add("DE"); break;
    case "en": add("GB"); break;
    default: break;
  }
  if (region && region.length === 2) out.add(region.toUpperCase());
  return out;
}

// Channels that carry the big sport of a market, best known first; lower is better.
const KNOWN = [
  /матч!?\s*(?:тв|премьер|футбол|арена|игра|боец|страна)|match/i,
  /боец|кхл|khl|окко|okko|eurosport|евроспорт|setanta|сетанта|viasat|спорт\s*1|наш\s*футбол/i,
  /sport|спорт|arena|dazn|bein|espn|sky|tnt/i,
];
function knownRank(item: GuideSportItem): number {
  let best = KNOWN.length;
  for (const c of item.channels) { const i = KNOWN.findIndex((r) => r.test(c.name)); if (i >= 0 && i < best) best = i; }
  return best;
}

/** Sports present, in their declaration order. */
export function sportsOf(items: readonly GuideSportItem[]): GuideSport[] {
  return GUIDE_SPORTS.filter((s) => items.some((it) => it.sport === s));
}

/**
 * [items] narrowed by the typed [query] (any layout, any case, a typo), the chosen [sports] and [countries] (none
 * chosen = all), and put in [sort] order.
 */
export function applyBoard(
  items: readonly GuideSportItem[], query: string, sports: ReadonlySet<GuideSport>, chosen: ReadonlySet<string>, sort: BoardSort,
  preferred: ReadonlySet<string> = new Set(),
): GuideSportItem[] {
  const kept0 = items.filter((it) => (sports.size === 0 || sports.has(it.sport)) && (chosen.size === 0 || chosen.has(countryOf(it) ?? "")));
  const searching = query.trim() !== "";
  const ranks = new Map<GuideSportItem, number>();
  if (searching) {
    for (const r of new SearchIndex(kept0, (it) => [it.title, ...it.channels.map((c) => c.name)].join(" ")).search(query)) ranks.set(r.item, r.rank);
  }
  const kept = searching ? kept0.filter((it) => ranks.has(it)) : kept0.slice();
  const relevance = (a: GuideSportItem, b: GuideSportItem) => {
    const pa = preferred.size === 0 || preferred.has(countryOf(a) ?? "") ? 0 : 1;
    const pb = preferred.size === 0 || preferred.has(countryOf(b) ?? "") ? 0 : 1;
    return pa - pb || knownRank(a) - knownRank(b) || b.channels.length - a.channels.length || a.start - b.start;
  };
  const rankOf = (it: GuideSportItem) => ranks.get(it) ?? 0;
  const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  if (searching && sort === "RELEVANCE") return kept.sort((a, b) => rankOf(a) - rankOf(b) || relevance(a, b));
  if (searching && sort === "TIME") return kept.sort((a, b) => rankOf(a) - rankOf(b) || a.start - b.start);
  if (sort === "RELEVANCE") return kept.sort(relevance);
  if (sort === "TIME") return kept.sort((a, b) => a.start - b.start || byText(a.title.toLowerCase(), b.title.toLowerCase()));
  if (sort === "TITLE") return kept.sort((a, b) => byText(normalize(a.title), normalize(b.title)));
  return kept.sort((a, b) => byText(normalize(a.channels[0]?.name ?? ""), normalize(b.channels[0]?.name ?? "")) || a.start - b.start);
}
