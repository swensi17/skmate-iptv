import { en } from "./en";
import { isRtl, resolveLanguage, type LanguageCode } from "./languages";
import { ru } from "./ru";

export type Key = keyof typeof ru;

type Table = Record<Key, string>;

// Every language of the Android app (see languages.ts); a test keeps each table complete. Russian and English are in
// the app itself; any other is a file of its own, fetched when chosen, so a TV parses one language, not twenty-four.
const loaded: Partial<Record<LanguageCode, Table>> = { ru, en };
const loaders: Record<Exclude<LanguageCode, "ru" | "en">, () => Promise<Table>> = {
  de: () => import("./de").then((m) => m.de), fr: () => import("./fr").then((m) => m.fr), es: () => import("./es").then((m) => m.es),
  it: () => import("./it").then((m) => m.it), pt: () => import("./pt").then((m) => m.pt), nl: () => import("./nl").then((m) => m.nl),
  sv: () => import("./sv").then((m) => m.sv), da: () => import("./da").then((m) => m.da), nb: () => import("./nb").then((m) => m.nb),
  pl: () => import("./pl").then((m) => m.pl), cs: () => import("./cs").then((m) => m.cs), hu: () => import("./hu").then((m) => m.hu),
  tr: () => import("./tr").then((m) => m.tr), eu: () => import("./eu").then((m) => m.eu), ar: () => import("./ar").then((m) => m.ar),
  hi: () => import("./hi").then((m) => m.hi), bn: () => import("./bn").then((m) => m.bn), ml: () => import("./ml").then((m) => m.ml),
  ja: () => import("./ja").then((m) => m.ja), ko: () => import("./ko").then((m) => m.ko),
  "zh-CN": () => import("./zh-CN").then((m) => m.zhCN), "zh-TW": () => import("./zh-TW").then((m) => m.zhTW),
};

const tvLanguage = (): string => (typeof navigator !== "undefined" ? navigator.language : "ru");

let table: Table = en;

/** Whether there is a table for [code]. */
export function hasLanguage(code: string): boolean {
  return code in loaded || code in loaders;
}

/** The code of ours for a setting ("auto", a code, or a TV's tag). */
function codeOf(choice: string): LanguageCode {
  if (choice === "auto") return resolveLanguage(tvLanguage());
  return hasLanguage(choice) ? (choice as LanguageCode) : resolveLanguage(choice);
}

/** Fetches the table of [choice] if it is not in the app yet, then shows it (see [applyLanguage]). */
export async function loadLanguage(choice: string): Promise<void> {
  const code = codeOf(choice);
  if (!loaded[code]) {
    try { loaded[code] = await loaders[code as keyof typeof loaders](); } catch { /* not reachable: English meanwhile */ }
  }
  applyLanguage(choice);
}

/** For tests and the language switch: [lang] is a code of ours or a TV's tag; English when we have none. */
export function setLanguage(lang: string): void {
  table = loaded[codeOf(lang)] ?? en;
}

/** "auto" follows the TV; anything else is a language of ours, once loaded. Sets the page language (and direction). */
export function applyLanguage(choice: string): void {
  const code = codeOf(choice);
  table = loaded[code] ?? en; // a language still being fetched shows English for that moment (loadLanguage)
  if (typeof document !== "undefined") {
    document.documentElement.lang = code;
    // Arabic reads right to left; the TV layout stays as it is, the text inside it is set right to left (app.css).
    if (isRtl(code)) document.documentElement.dataset.rtl = "";
    else delete document.documentElement.dataset.rtl;
  }
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  const raw = table[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}
