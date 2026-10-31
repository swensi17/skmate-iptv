import { Icon } from "@skmate/ui";
import { t } from "../i18n";

/** The title of every sheet and dialog with the Back arrow beside it, so each one closes the same way on a remote and a mouse. */
export function SheetHead(p: { title: string; onBack: () => void; id: string; right?: string }) {
  return (
    <div class="drawer-head">
      <button class="drawer-back" data-focus={p.id} aria-label={t("backBtn")} onClick={p.onBack}><Icon name="back" size={36} /></button>
      <div class="drawer-title">{p.title}</div>
      {p.right ? <div class="drawer-ver">{p.right}</div> : null}
    </div>
  );
}
