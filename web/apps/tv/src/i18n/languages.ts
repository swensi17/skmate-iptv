// The interface languages: those of the Android app (engine/core/src/main/res/values-*), each named in itself so a
// viewer finds their own whatever language the screen is in. Regional sets of the Android app (en-GB, es-US, pt-PT)
// read the same here as their main language.

export const LANGUAGES = [
  { code: "ru", name: "Русский" },
  { code: "en", name: "English" },
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "nl", name: "Nederlands" },
  { code: "sv", name: "Svenska" },
  { code: "da", name: "Dansk" },
  { code: "nb", name: "Norsk bokmål" },
  { code: "pl", name: "Polski" },
  { code: "cs", name: "Čeština" },
  { code: "hu", name: "Magyar" },
  { code: "tr", name: "Türkçe" },
  { code: "eu", name: "Euskara" },
  { code: "ar", name: "العربية" },
  { code: "hi", name: "हिन्दी" },
  { code: "bn", name: "বাংলা" },
  { code: "ml", name: "മലയാളം" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "zh-CN", name: "简体中文" },
  { code: "zh-TW", name: "繁體中文" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const CODES = new Set<string>(LANGUAGES.map((l) => l.code));

/** The language of ours for a TV's language tag ("pt-BR", "zh-Hant-TW", "nn"); English when we have none of it. */
export function resolveLanguage(tag: string | null | undefined): LanguageCode {
  const t = (tag ?? "").trim().replace(/_/g, "-").toLowerCase();
  if (t.startsWith("zh")) return /hant|-tw|-hk|-mo/.test(t) ? "zh-TW" : "zh-CN";
  const base = t.split("-")[0] ?? "";
  if (base === "no" || base === "nn") return "nb";
  return (CODES.has(base) ? base : "en") as LanguageCode;
}

/** Arabic is written right to left. */
export function isRtl(code: string): boolean {
  return code === "ar";
}
