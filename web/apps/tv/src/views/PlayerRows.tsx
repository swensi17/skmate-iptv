import { t } from "../i18n";
import type { Settings } from "../state/settings";
import { onOff, SettingRow } from "./SettingRow";

interface Props { settings: Settings; onChange: (s: Settings) => void }

/** Every player setting, in the order of the phone version; shared by the settings sheet and the panel inside the player. */
export function PlayerSettingRows({ settings: s, onChange }: Props) {
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => onChange({ ...s, [k]: v });
  const secs = (list: number[]) => list.map((n) => ({ value: n, label: t("seconds", { n }) }));
  return (
    <>
      <SettingRow id="s-engine" title="setEngine" hint="setEngineHint" value={s.engine} onPick={set("engine")}
        options={[{ value: "auto", label: t("engAuto") }, { value: "native", label: t("engNative") }, { value: "hls", label: t("engHls") }, { value: "mpegts", label: t("engMpegts") }]} />
      <SettingRow id="s-aspect" title="setAspect" hint="setAspectHint" value={s.aspect} onPick={set("aspect")}
        options={[{ value: "fit", label: t("aspFit") }, { value: "fill", label: t("aspFill") }, { value: "cover", label: t("aspCover") }]} />
      <SettingRow id="s-buffer" title="setBuffer" hint="setBufferHint" value={s.buffer} onPick={set("buffer")}
        options={[{ value: 10, label: t("bufSmall") }, { value: 30, label: t("bufNormal") }, { value: 60, label: t("bufLarge") }]} />
      <SettingRow id="s-timeout" title="setOpenTimeout" hint="setOpenTimeoutHint" value={s.openTimeout} onPick={set("openTimeout")}
        options={secs([8, 12, 20]) as never} />
      <SettingRow id="s-osd" title="setOsd" hint="setOsdHint" value={s.osdSeconds} onPick={set("osdSeconds")} options={secs([3, 5, 8]) as never} />
      <SettingRow id="s-showengine" title="setShowEngine" hint="setShowEngineHint" value={s.showEngine} onPick={set("showEngine")} options={onOff()} />
      <SettingRow id="s-restart" title="setAutoRestart" hint="setAutoRestartHint" value={s.autoRestart} onPick={set("autoRestart")} options={onOff()} />
      <SettingRow id="s-preview" title="setPreview" hint="setPreviewHint" value={s.preview} onPick={set("preview")} options={onOff()} />
    </>
  );
}
