import { Icon } from "@skmate/ui";
import { t } from "../i18n";

/** The programme guide arrives with XMLTV support; until then the section says so instead of showing an empty grid. */
export function GuideView() {
  return (
    <div class="screen empty">
      <Icon name="epg" size={96} />
      <div class="empty-title">{t("guideSoonTitle")}</div>
      <div class="empty-hint" style={{ maxWidth: 760 }}>{t("guideSoonHint")}</div>
    </div>
  );
}
