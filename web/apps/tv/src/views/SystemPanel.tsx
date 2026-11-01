import { useState } from "preact/hooks";
import { LANGUAGES } from "../i18n/languages";
import { t } from "../i18n";
import { clearCaches } from "../state/backup";
import { desktop } from "../state/desktop";
import { detectPlatform } from "../platform";
import type { Settings } from "../state/settings";
import type { UpdateState } from "../state/useUpdates";
import { SettingRow } from "./SettingRow";

const REPORT = "github.com/swensi17/skmate-iptv/issues/new";

/** Kilobytes the app holds in the browser's storage. */
function storageKb(): number {
  try {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) n += k.length + (localStorage.getItem(k)?.length ?? 0); }
    return Math.round((n * 2) / 1024);
  } catch { return 0; }
}

function updateHint(u: UpdateState): string {
  switch (u.kind) {
    case "checking": return t("updChecking");
    case "current": return t("updCurrent");
    case "unreachable": return t("updUnreachable");
    case "found": return t("updFound", { version: u.release.version });
    case "installing": return t("updateInstalling");
    case "failed": return t("updFailed", { version: u.release.version });
    default: return t("updHint");
  }
}

export function platformLabel(): string {
  const p = detectPlatform();
  return t(p === "webos" ? "platformWebos" : p === "tizen" ? "platformTizen" : "platformBrowser");
}

function Info({ id, title, value }: { id: string; title: string; value: string }) {
  return (
    <div class="irow" tabIndex={0} data-focus={id}>
      <span class="irow-title">{title}</span>
      <span class="irow-value">{value}</span>
    </div>
  );
}

export function SystemPanel({ settings, onChange, onQr, onReset, onRedo, update }: {
  update: { state: UpdateState; check: () => void; install: () => void };
  settings: Settings; onChange: (s: Settings) => void; onQr: (name: string, address: string) => void; onReset: () => void; onRedo: () => void;
}) {
  const [cleared, setCleared] = useState<number | null>(null);
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  return (
    <>
      <SettingRow<Settings["language"]> id="s-lang" title="setLanguage" hint="setLanguageHint" value={settings.language} onPick={(v) => onChange({ ...settings, language: v })}
        options={[{ value: "auto" as const, label: t("langAuto") }, ...LANGUAGES.map((l) => ({ value: l.code, label: l.name }))]} compact />
      <SettingRow<boolean> id="s-autoupdate" title="setAutoUpdate" hint="setAutoUpdateHint" value={settings.autoUpdate} onPick={(v) => onChange({ ...settings, autoUpdate: v })}
        options={[{ value: false, label: t("off") }, { value: true, label: t("on") }]} />
      <button class="srow" data-focus="s-update" onClick={() => (update.state.kind === "found" || update.state.kind === "failed" ? update.install() : update.check())}>
        <span class="srow-text">
          <span class="srow-title">{t("updCheck")}</span>
          <span class="srow-hint">{updateHint(update.state)}</span>
        </span>
      </button>
      <Info id="i-version" title={t("sysVersion")} value={__APP_VERSION__} />
      <Info id="i-platform" title={t("sysPlatform")} value={platformLabel()} />
      <Info id="i-screen" title={t("sysScreen")} value={`${window.innerWidth}×${window.innerHeight}`} />
      {mem ? <Info id="i-mem" title={t("sysMemory")} value={`${mem} GB`} /> : null}
      <Info id="i-storage" title={t("sysStorage")} value={`${storageKb()} KB`} />
      <button class="srow" data-focus="s-clear" onClick={() => setCleared(clearCaches(localStorage))}>
        <span class="srow-text">
          <span class="srow-title">{t("sysClear")}</span>
          <span class="srow-hint">{cleared === null ? t("sysClearHint") : t("sysCleared", { n: cleared })}</span>
        </span>
      </button>
      {desktop() ? (
        <button class="srow" data-focus="s-recordings" onClick={() => { desktop()?.openRecordings().catch(() => undefined); }}>
          <span class="srow-text"><span class="srow-title">{t("recFolder")}</span><span class="srow-hint">{t("recFolderHint")}</span></span>
        </button>
      ) : null}
      <button class="srow" data-focus="s-report" onClick={() => onQr(t("sysReport"), REPORT)}>
        <span class="srow-text"><span class="srow-title">{t("sysReport")}</span><span class="srow-hint">{t("sysReportHint")}</span></span>
      </button>
      <button class="srow" data-focus="s-redo" onClick={onRedo}>
        <span class="srow-text"><span class="srow-title">{t("wzRedo")}</span><span class="srow-hint">{t("wzRedoHint")}</span></span>
      </button>
      <button class="srow" data-focus="s-reset" onClick={onReset}>
        <span class="srow-text"><span class="srow-title">{t("setReset")}</span><span class="srow-hint">{t("setResetHint")}</span></span>
      </button>
    </>
  );
}
