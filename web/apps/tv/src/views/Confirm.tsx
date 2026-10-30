import { useEffect } from "preact/hooks";
import { focusFirst } from "@skmate/ui";
import { t } from "../i18n";

/** A question before something is lost. Focus starts on Cancel, so a stray OK never deletes. */
export function Confirm(props: { title: string; body: string; confirm: string; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => { focusFirst(document, "confirm-cancel"); }, []);
  return (
    <div class="scrim" data-modal>
      <div class="dialog" role="alertdialog" aria-label={props.title}>
        <div class="dialog-title">{props.title}</div>
        <div class="dialog-body">{props.body}</div>
        <div class="dialog-actions">
          <button class="btn" data-focus="confirm-cancel" onClick={props.onCancel}>{t("confirmCancel")}</button>
          <button class="btn" data-focus="confirm-ok" onClick={props.onConfirm}>{props.confirm}</button>
        </div>
      </div>
    </div>
  );
}
