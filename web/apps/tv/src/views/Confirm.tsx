import { useEffect, useRef } from "preact/hooks";
import { Button, focusFirst, Popup, useOwnBack } from "@skmate/ui";
import { OverSheet } from "./SettingsKit";
import { t } from "../i18n";

/**
 * A question before something is lost or changed (StagePopup.kt StageConfirm): a popup 760 wide, the title and the
 * line under it, Cancel and the answer at the bottom right. Focus starts on Cancel, so a stray OK changes nothing;
 * Back is Cancel.
 */
export function Confirm(props: { title: string; body: string; confirm: string; cancel?: string; onConfirm: () => void; onCancel: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useOwnBack(root, props.onCancel);
  useEffect(() => { setTimeout(() => focusFirst(document, "confirm-cancel"), 0); }, []);
  return (
    <OverSheet>
      <div ref={root}>
        <Popup title={props.title} body={props.body || undefined} width={760} onClose={props.onCancel} returnFocus
          buttons={(
            <>
              <Button small id="confirm-cancel" text={props.cancel ?? t("confirmCancel")} onClick={props.onCancel} />
              <Button small id="confirm-ok" text={props.confirm} onClick={props.onConfirm} />
            </>
          )} />
      </div>
    </OverSheet>
  );
}
