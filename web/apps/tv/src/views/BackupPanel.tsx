import { useRef, useState } from "preact/hooks";
import { t } from "../i18n";
import { buildBackup, parseBackup, restoreBackup } from "../state/backup";
import { desktop } from "../state/desktop";
import { loadFavorites } from "../state/favorites";
import { loadHistory } from "../state/history";
import { InfoCard, pl, tf } from "./SettingsKit";
import { SyncDialog } from "./SyncDialog";

/**
 * Резервная копия и восстановление (BackupScreen.kt): the status card (not focusable), then four cards. Saving
 * downloads a file; restoring reads one (a TV browser may not have files: the status line says what happened). Sending
 * to and restoring from another device need a server on this device: the Windows app has one (its sync window).
 */
export function BackupPanel({ playlists }: { playlists: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean; ok?: boolean } | null>(null);
  const [sync, setSync] = useState(false);
  const favs = loadFavorites().size;
  const history = loadHistory().length;

  const save = () => {
    try {
      const blob = new Blob([JSON.stringify(buildBackup(localStorage), null, 1)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `skmate-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setStatus({ text: tf("sa_settings_backup_saved_to", a.download), ok: true });
    } catch {
      setStatus({ text: t("sa_settings_backup_export_error"), error: true });
    }
  };

  const load = async (file: File | undefined) => {
    if (!file) return;
    setStatus({ text: t("sa_settings_backup_working") });
    const backup = parseBackup(await file.text());
    if (!backup) { setStatus({ text: t("sa_settings_backup_read_error"), error: true }); return; }
    const n = restoreBackup(backup, localStorage);
    setStatus({ text: pl("sa_settings_backup_restored", n), ok: true });
    setTimeout(() => location.reload(), 900); // the restored profile, playlists and settings take effect from a clean start
  };
  const other = () => (desktop() ? setSync(true) : setStatus({ text: t("sa_web_backup_other"), error: true }));

  return (
    <div class="set-pad">
      <div class="set-status-card">
        <span class="set-card-icon muted"><svg viewBox="0 0 256 256" width={40} height={40} fill="currentColor" aria-hidden="true"><path d="M247.93,124.52C246.11,77.54,207.07,40,160.06,40A88.1,88.1,0,0,0,81.29,88.67h0A87.48,87.48,0,0,0,72,127.73,8.18,8.18,0,0,1,64.57,136,8,8,0,0,1,56,128a103.66,103.66,0,0,1,5.34-32.92,4,4,0,0,0-4.75-5.18A64.09,64.09,0,0,0,8,152c0,35.19,29.75,64,65,64H160a88.09,88.09,0,0,0,87.93-91.48Zm-38.31,13.14a8,8,0,0,1-11.31,0L168,107.31V176a8,8,0,0,1-16,0V107.31l-30.31,30.35a8,8,0,0,1-11.31-11.32l44-44a8,8,0,0,1,11.31,0l44,44A8,8,0,0,1,209.62,137.66Z" /></svg></span>
        <span class="set-card-text">
          <span class="set-status-title">{t("sa_more_backup_never_title")}</span>
          <span class="set-status-body">{tf("sa_more_backup_never_body", pl("sa_more_playlist_count", playlists), pl("sa_more_count_favorites", favs), pl("sa_more_count_history", history))}</span>
        </span>
      </div>
      <div class="set-cards">
        <InfoCard id="bk-save" icon="FOLDER" title={t("sa_more_backup_save_here")} label={t("sa_more_backup_now")} body={t("sa_more_backup_now_body")} onOk={save} />
        <InfoCard id="bk-send" icon="NETWORK" title={t("sa_more_backup_send_other")} label={t("sa_more_backup_now")} onOk={other} />
        <InfoCard id="bk-load" icon="REFRESH" title={t("sa_more_backup_restore_here")} label={t("sa_settings_backup_restore_action")} body={t("sa_more_restore_body")} onOk={() => input.current?.click()} />
        <InfoCard id="bk-recv" icon="NETWORK" title={t("sa_more_backup_restore_other")} label={t("sa_settings_backup_restore_action")} onOk={other} />
      </div>
      {status ? <div class={`set-status${status.error ? " error" : status.ok ? " ok" : ""}`} role="status">{status.text}</div> : null}
      <input ref={input} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => void load((e.currentTarget as HTMLInputElement).files?.[0])} />
      {sync ? <SyncDialog onClose={() => setSync(false)} /> : null}
    </div>
  );
}
