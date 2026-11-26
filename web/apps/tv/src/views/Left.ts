import { t } from "../i18n";
import { left } from "../time";

/** "осталось 24 мин" for a programme that ends at [stop], seen at [now]; "" once it is over. */
export function leftLabel(stop: number, now: number): string {
  const l = left(stop - now);
  if (!l) return "";
  return l.h > 0 ? t("leftHour", { h: l.h, m: String(l.m).padStart(2, "0") }) : t("leftMin", { m: l.m });
}

/** "через 25 мин" / "через 2 ч 10 мин" for something that starts at [start], seen at [now]. */
export function startsInLabel(start: number, now: number): string {
  const total = Math.max(1, Math.ceil((start - now) / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? t("inHour", { h, m: String(m).padStart(2, "0") }) : t("inMin", { m });
}

/**
 * Android's time left (features/home/HomeRowText.kt timeLeftText, LiveStage.kt minutesLeft): the minutes rounded up,
 * "осталось 51 мин" under an hour, "осталось 1 ч 05 мин" from an hour on; "" once it is over.
 */
export function timeLeftText(stop: number, now: number): string {
  const ms = stop - now;
  if (ms <= 0) return "";
  const minutes = Math.floor((ms + 59_999) / 60_000);
  const d = minutes >= 60
    ? t("homeHoursMinutes", { h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, "0") })
    : t("homeMinutes", { m: minutes });
  return t("homeTimeLeft", { d });
}

type Plural = "zero" | "one" | "two" | "few" | "many" | "other";
let rules: { lang: string; select: (n: number) => Plural } | null = null;

/** The plural form of [n] in the page's language (Intl.PluralRules where the TV has it, else Russian's own rule). */
function pluralOf(n: number): Plural {
  const lang = typeof document !== "undefined" ? document.documentElement.lang || "en" : "en";
  if (!rules || rules.lang !== lang) {
    const PR = (Intl as unknown as { PluralRules?: new (l: string) => { select(n: number): string } }).PluralRules;
    let select: (n: number) => Plural;
    if (PR) { const r = new PR(lang); select = (k) => r.select(k) as Plural; }
    else if (lang === "ru") select = (k) => (k % 10 === 1 && k % 100 !== 11 ? "one" : k % 10 >= 2 && k % 10 <= 4 && (k % 100 < 12 || k % 100 > 14) ? "few" : "many");
    else select = (k) => (k === 1 ? "one" : "other");
    rules = { lang, select };
  }
  return rules.select(n);
}

/** "3 дня" (settings_epg_guide_days_value): the archive tag of a channel row. */
export function daysText(n: number): string {
  return t(`homeDays_${pluralOf(n)}` as "homeDays_other", { n });
}
