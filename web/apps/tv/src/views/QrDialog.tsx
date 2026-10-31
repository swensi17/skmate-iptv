import { useEffect } from "preact/hooks";
import { focusFirst, Qr } from "@skmate/ui";
import { t } from "../i18n";

/** The address of a link as a QR code: a TV has no browser to open it in, a phone does. */
export function QrDialog({ name, address, onClose }: { name: string; address: string; onClose: () => void }) {
  useEffect(() => { focusFirst(document, "qr-close"); }, []);
  return (
    <div class="scrim" data-modal onClick={onClose}>
      <div class="dialog qr" role="dialog" aria-label={name} onClick={(e) => e.stopPropagation()}>
        <div class="dialog-title">{name}</div>
        <div class="qr-code"><Qr text={`https://${address}`} size={360} /></div>
        <div class="dialog-body" style={{ textAlign: "center", marginBottom: 24 }}>{address}<br />{t("qrScan")}</div>
        <div class="dialog-actions" style={{ justifyContent: "center" }}>
          <button class="btn" data-focus="qr-close" onClick={onClose}>{t("close")}</button>
        </div>
      </div>
    </div>
  );
}
