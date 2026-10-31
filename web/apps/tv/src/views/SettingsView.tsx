import { useEffect, useState } from "preact/hooks";
import { focusFirst, type MotionSetting } from "@skmate/ui";
import { t, type Key } from "../i18n";
import type { PlaylistStore } from "../state/playlists";
import type { Settings } from "../state/settings";
import type { Status } from "../state/usePlaylists";
import { PlaylistsPanel } from "./PlaylistsPanel";
import { onOff, SettingRow } from "./SettingRow";

type Tab = "player" | "look" | "playlists" | "more";
const TABS: Array<[Tab, Key]> = [
  ["player", "tabPlayer"], ["look", "tabLook"], ["playlists", "tabPlaylists"], ["more", "tabMore"],
];

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  store: PlaylistStore;
  status: Status;
  onAddPlaylist: (input: string) => string | null;
  onSelectPlaylist: (id: string) => void;
  onAskDeletePlaylist: (id: string) => void;
  onAskReset: () => void;
}

/** The player settings, shared by this screen and the panel inside the player. */
export function PlayerSettingRows({ settings: s, onChange }: Pick<Props, "settings" | "onChange">) {
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => onChange({ ...s, [k]: v });
  return (
    <>
      <SettingRow id="s-engine" title="setEngine" hint="setEngineHint" value={s.engine} onPick={set("engine")}
        options={[{ value: "auto", label: t("engAuto") }, { value: "native", label: t("engNative") }, { value: "hls", label: t("engHls") }]} />
      <SettingRow id="s-aspect" title="setAspect" hint="setAspectHint" value={s.aspect} onPick={set("aspect")}
        options={[{ value: "fit", label: t("aspFit") }, { value: "fill", label: t("aspFill") }, { value: "cover", label: t("aspCover") }]} />
      <SettingRow id="s-buffer" title="setBuffer" hint="setBufferHint" value={s.buffer} onPick={set("buffer")}
        options={[{ value: 10, label: t("bufSmall") }, { value: 30, label: t("bufNormal") }, { value: 60, label: t("bufLarge") }]} />
    </>
  );
}

export function SettingsView(p: Props) {
  const { settings: s, onChange } = p;
  const [tab, setTab] = useState<Tab>("player");
  // Only on entering the screen: later the tabs are walked with the arrows, and the focus must stay on them.
  useEffect(() => { focusFirst(document, "s-engine"); }, []);
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => onChange({ ...s, [k]: v });

  return (
    <div class="screen settings">
      <div class="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button class="tab" key={id} data-focus={`tab-${id}`} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            onFocus={() => setTab(id)}>
            {t(label)}
          </button>
        ))}
      </div>
      <div class="settings-body">
        {tab === "player" ? (
          <>
            <PlayerSettingRows settings={s} onChange={onChange} />
            <SettingRow id="s-timeout" title="setOpenTimeout" hint="setOpenTimeoutHint" value={s.openTimeout} onPick={set("openTimeout")}
              options={[8, 12, 20].map((n) => ({ value: n as Settings["openTimeout"], label: t("seconds", { n }) }))} />
            <SettingRow id="s-osd" title="setOsd" hint="setOsdHint" value={s.osdSeconds} onPick={set("osdSeconds")}
              options={[3, 5, 8].map((n) => ({ value: n as Settings["osdSeconds"], label: t("seconds", { n }) }))} />
            <SettingRow id="s-showengine" title="setShowEngine" hint="setShowEngineHint" value={s.showEngine} onPick={set("showEngine")} options={onOff()} />
            <SettingRow id="s-restart" title="setAutoRestart" hint="setAutoRestartHint" value={s.autoRestart} onPick={set("autoRestart")} options={onOff()} />
          </>
        ) : null}
        {tab === "look" ? (
          <>
            <SettingRow id="s-theme" title="settingsTheme" hint="settingsThemeHint" value={s.theme} onPick={set("theme")}
              options={[{ value: "system", label: t("themeSystem") }, { value: "dark", label: t("themeDark") }, { value: "light", label: t("themeLight") }]} />
            <SettingRow<MotionSetting> id="s-motion" title="settingsMotion" hint="settingsMotionHint" value={s.motion} onPick={set("motion")}
              options={[{ value: "auto", label: t("motionAuto") }, { value: "on", label: t("motionOn") }, { value: "off", label: t("motionOff") }]} />
          </>
        ) : null}
        {tab === "playlists" ? (
          <PlaylistsPanel store={p.store} status={p.status} onAdd={p.onAddPlaylist} onSelect={p.onSelectPlaylist} onAskDelete={p.onAskDeletePlaylist} />
        ) : null}
        {tab === "more" ? (
          <>
            <SettingRow id="s-lang" title="setLanguage" hint="setLanguageHint" value={s.language} onPick={set("language")}
              options={[{ value: "auto", label: t("langAuto") }, { value: "ru", label: t("langRu") }, { value: "en", label: t("langEn") }]} />
            <button class="srow" data-focus="s-reset" onClick={p.onAskReset}>
              <span class="srow-text">
                <span class="srow-title">{t("setReset")}</span>
                <span class="srow-hint">{t("setResetHint")}</span>
              </span>
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
