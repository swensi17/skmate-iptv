import { useEffect, useState } from "preact/hooks";
import { isBack } from "@skmate/ui";
import { t } from "../i18n";
import { usePlayers } from "../state/desktop";
import type { Settings } from "../state/settings";
import { Confirm } from "./Confirm";
import { onOff, SettingRow } from "./SettingRow";

interface Props { settings: Settings; onChange: (s: Settings) => void }

/** Every player setting, in the order of the phone version; shared by the settings sheet and the panel inside the player. */
export function PlayerSettingRows({ settings: s, onChange }: Props) {
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => onChange({ ...s, [k]: v });
  // Only players found on this computer are offered; with none (a TV, a browser) the row is not there.
  const players = usePlayers();
  // More than two tiles want more connections than most providers give: asked once, as on Android.
  const [asking, setAsking] = useState<number | null>(null);
  useEffect(() => {
    if (asking === null) return;
    const onKey = (e: KeyboardEvent) => { if (isBack(e)) { e.stopPropagation(); e.preventDefault(); setAsking(null); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [asking]);
  const pickTiles = (n: number) => { if (n > 2 && !s.multiviewWarned) setAsking(n); else onChange({ ...s, multiviewTiles: n }); };
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
      {players.length > 0 ? (
        <SettingRow id="s-external" title="setExternal" hint="setExternalHint" value={s.externalPlayer} onPick={set("externalPlayer")}
          options={[{ value: "off", label: t("off") }, ...players.map((p) => ({ value: p as "vlc" | "mpv", label: p === "vlc" ? "VLC" : "mpv" }))]} />
      ) : null}
      <SettingRow id="s-multiview" title="setMultiview" hint="setMultiviewHint" value={s.multiview} onPick={set("multiview")} options={onOff()} />
      {s.multiview ? (
        <SettingRow<number> id="s-mvtiles" title="setMultiviewTiles" value={s.multiviewTiles} onPick={pickTiles}
          options={[1, 2, 3, 4].map((n) => ({ value: n, label: t("mvMaxValue", { n }) }))} />
      ) : null}
      {asking !== null ? (
        <Confirm title={t("mvWarnTitle")} body={t("mvWarnBody")} confirm={t("mvUseAnyway")} cancel={t("mvKeepTwo")}
          onCancel={() => { setAsking(null); onChange({ ...s, multiviewTiles: 2, multiviewWarned: s.multiviewWarned }); }}
          onConfirm={() => { onChange({ ...s, multiviewTiles: asking, multiviewWarned: true }); setAsking(null); }} />
      ) : null}
      <SettingRow id="s-preview" title="setPreview" hint="setPreviewHint" value={s.preview} onPick={set("preview")} options={onOff()} />
    </>
  );
}
