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
