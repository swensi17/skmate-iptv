import { Icon } from "@skmate/ui";
import { t } from "../i18n";

/**
 * The title of a sheet or dialog. With [onBack] an arrow sits before the title and goes one step back, the same step
 * as the remote's Back key (Esc, a right click, a click outside), so nobody has to guess that Back exists.
 */
export function SheetHead(p: { title: string; right?: string; onBack?: () => void }) {
  return (
    <div class="drawer-head">
      {p.onBack ? (
        <button class="sheet-back" data-focus="sheet-back" aria-label={t("wzBack")} onClick={p.onBack}>
          <Icon name="back" size={36} />
        </button>
      ) : null}
      <div class="drawer-title">{p.title}</div>
      {p.right ? <div class="drawer-ver">{p.right}</div> : null}
    </div>
  );
}
