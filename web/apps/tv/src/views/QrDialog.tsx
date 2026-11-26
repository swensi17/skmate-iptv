import { useEffect } from "preact/hooks";
import { Button, focusFirst, Popup, Qr } from "@skmate/ui";
import { OverSheet } from "./SettingsKit";
import { t } from "../i18n";

/**
 * A link as a QR code (MorePages.kt AboutPage's popup): StagePopup 640 wide, the name as its title, "scan it with
 * your phone" under it, the code on a white 300 box, the address 22/700 under it, and OK. A TV has no browser for it.
 */
export function QrDialog({ name, address, onClose }: { name: string; address: string; onClose: () => void }) {
  useEffect(() => { setTimeout(() => focusFirst(document, "qr-done"), 0); }, []);
  return (
    <OverSheet>
      <Popup title={name} body={t("sa_about_social_qr_body")} width={640} onClose={onClose} returnFocus
        buttons={<Button small id="qr-done" text={t("sa_common_ok")} onClick={onClose} />}>
        <div class="set-qr">
          <div class="set-qr-box"><Qr text={`https://${address}`} size={276} /></div>
          <div class="set-qr-addr">{address}</div>
        </div>
      </Popup>
    </OverSheet>
  );
}
