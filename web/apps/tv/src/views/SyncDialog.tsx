import { createPortal } from "preact/compat";
import { useState } from "preact/hooks";
import { t } from "../i18n";
import { buildBackup, parseBackup, restoreBackup, type Backup } from "../state/backup";
import { desktop } from "../state/desktop";
import { Confirm } from "./Confirm";
import { LinkDialog } from "./LinkDialog";

const ERRORS = { unreachable: "syncUnreachable", unauthorized: "syncUnauthorized", bad: "syncBad" } as const;

/**
 * Everything this app holds, to or from another SkMate on the same Wi-Fi (Windows), after the Android app's local
 * sync: this one waits with its address and PIN, or connects to the other's and sends or receives. What arrives is
 * applied only after "Apply", and then the app starts again with it, as a restored backup does.
 */
export function SyncDialog({ onClose }: { onClose: () => void }) {
  const [address, setAddress] = useState("");
  const [pin, setPin] = useState("");
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [incoming, setIncoming] = useState<Backup | null>(null);
  const mine = () => JSON.stringify(buildBackup(localStorage));
  const [snapshot] = useState(mine);

  const run = async (method: "GET" | "POST") => {
    const app = desktop();
    if (!app || busy) return;
    if (!address.trim() || !/^\d{6}$/.test(pin.trim())) { setNote({ text: t("syncUnauthorized"), error: true }); return; }
    setBusy(true);
    setNote(null);
    const r = await app.syncRequest(address.trim(), pin.trim(), method, method === "POST" ? mine() : undefined).catch(() => ({ error: "unreachable" as const }));
    setBusy(false);
    if (r.error) { setNote({ text: `${t("syncFailed")}. ${t(ERRORS[r.error])}`, error: true }); return; }
    if (method === "POST") { setNote({ text: t("syncSent"), error: false }); return; }
    const b = parseBackup(r.text ?? "");
    if (!b) { setNote({ text: `${t("syncFailed")}. ${t("syncBad")}`, error: true }); return; }
    setIncoming(b);
  };
  const apply = (b: Backup) => {
    restoreBackup(b, localStorage);
    setIncoming(null);
    setNote({ text: t("syncDone"), error: false });
    setTimeout(() => location.reload(), 900); // the profile, playlists and settings that came take effect from a clean start
  };
  const input = (id: string, value: string, set: (v: string) => void, placeholder: string, numeric = false) => (
    <input class="field" data-focus={id} value={value} placeholder={placeholder} inputMode={numeric ? "numeric" : "url"}
      autocomplete="off" spellcheck={false} maxLength={numeric ? 6 : undefined}
      onInput={(e) => { set((e.currentTarget as HTMLInputElement).value); setNote(null); }} />
  );
  const target = address.trim() || "…";

  return (
    <>
      <LinkDialog mode="sync" title={t("syncTitle")} hints={[t("syncHostHint")]} backup={snapshot} onClose={onClose}
        onEvent={(e) => { if (e.kind === "backup") { const b = parseBackup(e.text); if (b) setIncoming(b); } }}>
        <div class="link-form">
          <div class="setting-title">{t("syncConnect")}</div>
          <div class="link-hint">{t("syncConnectHint")}</div>
          {input("sync-address", address, setAddress, `${t("syncAddress")}: 192.168.1.20`)}
          {input("sync-pin", pin, setPin, t("syncPin"), true)}
          <div class="row-actions">
            <button class="btn" data-focus="sync-send" disabled={busy} onClick={() => void run("POST")}>
              {t("syncSendTo", { device: target })}<small>{t("syncSendHint")}</small>
            </button>
            <button class="btn" data-focus="sync-receive" disabled={busy} onClick={() => void run("GET")}>
              {t("syncReceiveFrom", { device: target })}<small>{t("syncReceiveHint")}</small>
            </button>
          </div>
          {note ? <div class={`status${note.error ? " error" : ""}`}>{note.text}</div> : null}
        </div>
      </LinkDialog>
      {incoming ? createPortal(
        <Confirm title={t("syncConfirmTitle")} body={t("syncReceiveHint")} confirm={t("syncApply")}
          onCancel={() => setIncoming(null)} onConfirm={() => apply(incoming)} />,
        document.body,
      ) : null}
    </>
  );
}
