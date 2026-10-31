import { useState } from "preact/hooks";
import { t } from "../i18n";
import { clearCaches } from "../state/backup";
import { detectPlatform } from "../platform";
import type { Settings } from "../state/settings";
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

export function SystemPanel({ settings, onChange, onQr, onReset }: {
  settings: Settings; onChange: (s: Settings) => void; onQr: (name: string, address: string) => void; onReset: () => void;
}) {
  const [cleared, setCleared] = useState<number | null>(null);
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  return (
    <>
      <SettingRow<Settings["language"]> id="s-lang" title="setLanguage" hint="setLanguageHint" value={settings.language} onPick={(v) => onChange({ ...settings, language: v })}
        options={[{ value: "auto", label: t("langAuto") }, { value: "ru", label: t("langRu") }, { value: "en", label: t("langEn") }]} />
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
      <button class="srow" data-focus="s-report" onClick={() => onQr(t("sysReport"), REPORT)}>
        <span class="srow-text"><span class="srow-title">{t("sysReport")}</span><span class="srow-hint">{t("sysReportHint")}</span></span>
      </button>
      <button class="srow" data-focus="s-reset" onClick={onReset}>
        <span class="srow-text"><span class="srow-title">{t("setReset")}</span><span class="srow-hint">{t("setResetHint")}</span></span>
      </button>
    </>
  );
}
