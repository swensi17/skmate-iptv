import { t } from "../i18n";
import { left } from "../time";

/** "осталось 24 мин" for a programme that ends at [stop], seen at [now]; "" once it is over. */
export function leftLabel(stop: number, now: number): string {
  const l = left(stop - now);
  if (!l) return "";
  return l.h > 0 ? t("leftHour", { h: l.h, m: String(l.m).padStart(2, "0") }) : t("leftMin", { m: l.m });
}
