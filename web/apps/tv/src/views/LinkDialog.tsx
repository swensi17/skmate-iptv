import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { focusFirst, Qr } from "@skmate/ui";
import { t } from "../i18n";
import { desktop, type CompanionEvent } from "../state/desktop";
import { SheetHead } from "./SheetHead";

/** The page a phone opens, in the app's language (desktop/companion.cjs fills it with these). */
function pageStrings(): Record<string, string> {
  return {
    pinPageTitle: t("cpPinPageTitle"), pinHeading: t("cpPinHeading"), pinDescription: t("cpPinDescription"),
    continue: t("cpContinue"), pinMismatch: t("cpPinMismatch"), addPageTitle: t("cpAddPageTitle"), addHeading: t("cpAddHeading"),
    kindM3u: t("srcM3u"), kindXtream: t("srcXtream"), kindStalker: t("stkKind"), m3uUrl: t("playlistUrlPlaceholder"),
    playlistFile: t("cpPlaylistFile"), urlOrFile: t("cpUrlOrFile"), sendToTv: t("cpSendToTv"), sending: t("cpSending"),
    xtServer: t("xtServer"), xtUser: t("xtUser"), xtPass: t("xtPass"), stkPortal: t("stkPortal"), stkMac: t("stkMac"),
    savedPageTitle: t("cpSavedPageTitle"), savedHeading: t("cpSavedHeading"), sendAnother: t("cpSendAnother"),
    syncTitle: t("syncBrowserTitle"), syncBody: t("syncBrowserBody"), unauthorized: t("cpUnauthorized"), missingFields: t("cpMissingFields"),
  };
}

/**
 * This computer waiting for another device on the Wi-Fi, as the Android app's companion screen: its address as a
 * QR code and as text, and the PIN. "add": a phone sends a playlist; "sync": another SkMate sends or takes a backup.
 * The server runs while the dialog is open; ten wrong PINs close it, and Retry opens it again with a new PIN.
 */
export function LinkDialog(p: { mode: "add" | "sync"; title: string; hints: string[]; backup?: string; onEvent: (e: CompanionEvent) => void; onClose: () => void; children?: preact.ComponentChildren }) {
  const [link, setLink] = useState<{ urls: string[]; pin: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  const onEvent = useRef(p.onEvent);
  onEvent.current = p.onEvent;
  useEffect(() => {
    const app = desktop();
    if (!app) return;
    let live = true;
    setLink(null);
    setFailed(false);
    app.startCompanion(p.mode, pageStrings(), document.documentElement.lang || "en", p.backup).then(
      (l) => { if (live) setLink(l); },
      () => { if (live) setFailed(true); },
    );
    const off = app.onCompanion((e) => { if (e.kind === "locked") setFailed(true); else onEvent.current(e); });
    return () => { live = false; off(); void app.stopCompanion(); };
  }, [round]);
  useEffect(() => { focusFirst(document, failed ? "link-retry" : "link-done"); }, [failed, link === null]);
  const url = link?.urls[0];
  // Over the whole window, not inside the settings sheet it was opened from (the sheet is a frame of its own). Only
  // the Windows app shows this, and there the page is sized by Electron's zoom, not by scaling #app.
  return createPortal(
    <div class="scrim" data-modal onClick={p.onClose}>
      <div class="dialog qr link" role="dialog" aria-label={p.title} onClick={(e) => e.stopPropagation()}>
        <SheetHead title={p.title} />
        {failed ? (
          <div class="dialog-body" style={{ textAlign: "center" }}>{t("cpUnauthorized")}</div>
        ) : url ? (
          <div class="link-body">
            <div class="qr-code"><Qr text={url} size={300} /></div>
            <div class="link-text">
              <div class="link-url">{link.urls.map((u) => <div key={u}>{u.replace(/\/$/, "")}</div>)}</div>
              <div class="link-pin">{t("pinIs", { pin: link.pin })}</div>
              {p.hints.map((h) => <div class="link-hint" key={h}>{h}</div>)}
            </div>
          </div>
        ) : (
          <div class="link-body" />
        )}
        {p.children}
        <div class="dialog-actions" style={{ justifyContent: "center" }}>
          {failed ? <button class="btn" data-focus="link-retry" onClick={() => setRound((n) => n + 1)}>{t("playerRetry")}</button> : null}
          <button class="btn" data-focus="link-done" onClick={p.onClose}>{t("done")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
