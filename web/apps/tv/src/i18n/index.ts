import { en } from "./en";
import { ru } from "./ru";

export type Key = keyof typeof ru;

const tables: Record<string, Record<Key, string>> = { ru, en };

function pick(): Record<Key, string> {
  const lang = (typeof navigator !== "undefined" ? navigator.language : "ru").slice(0, 2).toLowerCase();
  return tables[lang] ?? en;
}

let table = pick();

/** For tests and a future language switch. */
export function setLanguage(lang: string): void {
  table = tables[lang] ?? en;
}

/** "auto" follows the TV; anything else is a language of ours. */
export function applyLanguage(choice: string): void {
  setLanguage(choice === "auto" ? (typeof navigator !== "undefined" ? navigator.language.slice(0, 2).toLowerCase() : "ru") : choice);
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  const raw = table[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}
