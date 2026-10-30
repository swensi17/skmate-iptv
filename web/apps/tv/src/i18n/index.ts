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

export function t(key: Key, vars?: Record<string, string | number>): string {
  const raw = table[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}
