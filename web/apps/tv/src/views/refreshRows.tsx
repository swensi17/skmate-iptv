import { t, type Key } from "../i18n";
import { SRow } from "./SettingsKit";

/** Settings › guide update (2.6.9, Android EpgAutoRefresh): never, at start, every 1 to 48 hours. */
export const EPG_EVERY: Array<[number, Key]> = [
  [0, "sa_settings_sources_refresh_off"], [-1, "sa_settings_sources_refresh_startup"], [1, "sa_settings_epg_refresh_1h"],
  [3, "sa_settings_epg_refresh_3h"], [6, "sa_settings_epg_refresh_6h"], [12, "sa_settings_epg_refresh_12h"],
  [24, "sa_settings_epg_refresh_24h"], [48, "sa_settings_epg_refresh_48h"],
];
/** Settings › playlist update (Android PlaylistAutoRefresh): never, at start, every 2 to 48 hours. */
export const PL_EVERY: Array<[number, Key]> = [
  [0, "sa_settings_sources_refresh_off"], [-1, "sa_settings_sources_refresh_startup"], [2, "sa_settings_sources_refresh_2h"],
  [6, "sa_settings_sources_refresh_6h"], [12, "sa_settings_sources_refresh_12h"], [24, "sa_settings_epg_refresh_24h"],
  [48, "sa_settings_epg_refresh_48h"],
];

/** "Update automatically" with ◀ ▶ (and OK) walking its choices, then "Update now". */
export function RefreshRows(p: { id: string; value: number; choices: Array<[number, Key]>; onPick: (v: number) => void; onNow: () => void; busy?: boolean }) {
  const at = Math.max(0, p.choices.findIndex(([v]) => v === p.value));
  const step = (d: number) => {
    const next = p.choices[(at + d + p.choices.length) % p.choices.length];
    if (next) p.onPick(next[0]);
  };
  return (
    <>
      <SRow id={`${p.id}-auto`} icon="REFRESH" title={t("sa_settings_epg_sources_auto_refresh_title")}
        line={t((p.choices[at] as [number, Key])[1])} onStep={step} onOk={() => step(1)} />
      <SRow id={`${p.id}-now`} icon="REFRESH" title={t("sa_settings_refresh_now")} disabled={p.busy} onOk={p.onNow} />
    </>
  );
}
