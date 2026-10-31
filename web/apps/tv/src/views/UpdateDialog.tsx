import { useEffect } from "preact/hooks";
import { focusFirst } from "@skmate/ui";
import { t } from "../i18n";
import type { Release } from "../state/updates";

/** A new version is out: install it now, or leave it until the next start. Focus starts on Install. */
export function UpdateDialog(p: { release: Release; installing: boolean; onInstall: () => void; onLater: () => void }) {
  useEffect(() => { focusFirst(document, "update-ok"); }, []);
  return (
    <div class="scrim" data-modal>
      <div class="dialog" role="alertdialog" aria-label={t("updateTitle")}>
        <div class="dialog-title">{t("updateTitle")}</div>
        <div class="dialog-body">
          {t("updateBody", { version: p.release.version, current: __APP_VERSION__ })}
          {p.release.notes ? <div class="setting-hint">{p.release.notes}</div> : null}
        </div>
        <div class="dialog-actions">
          {p.installing ? <div class="dialog-body">{t("updateInstalling")}</div> : (
            <>
              <button class="btn" data-focus="update-later" onClick={p.onLater}>{t("updateLater")}</button>
              <button class="btn" data-focus="update-ok" onClick={p.onInstall}>{t("updateInstall")}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
