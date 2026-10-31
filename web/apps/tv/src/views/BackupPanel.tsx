import { useRef, useState } from "preact/hooks";
import { t } from "../i18n";
import { buildBackup, parseBackup, restoreBackup } from "../state/backup";

/** A copy of everything the viewer set up, to a file and back. A TV may not open files: the note says so. */
export function BackupPanel() {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const save = () => {
    const blob = new Blob([JSON.stringify(buildBackup(localStorage), null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skmate-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const load = async (file: File | undefined) => {
    if (!file) return;
    const backup = parseBackup(await file.text());
    if (!backup) { setMessage(t("bkBad")); return; }
    const n = restoreBackup(backup, localStorage);
    setMessage(t("bkDone", { n }));
    setTimeout(() => location.reload(), 900); // the restored profile, playlists and settings take effect from a clean start
  };

  return (
    <>
      <button class="srow" data-focus="bk-save" onClick={save}>
        <span class="srow-text"><span class="srow-title">{t("bkSave")}</span><span class="srow-hint">{t("bkSaveHint")}</span></span>
      </button>
      <button class="srow" data-focus="bk-load" onClick={() => input.current?.click()}>
        <span class="srow-text"><span class="srow-title">{t("bkLoad")}</span><span class="srow-hint">{message ?? t("bkLoadHint")}</span></span>
      </button>
      <input ref={input} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => void load((e.currentTarget as HTMLInputElement).files?.[0])} />
      <div class="about-note">{t("bkTvNote")}</div>
    </>
  );
}
