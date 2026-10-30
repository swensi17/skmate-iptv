import { useEffect } from "preact/hooks";
import { focusFirst, type MotionSetting } from "@skmate/ui";
import { t, type Key } from "../i18n";
import type { PlaylistStore } from "../state/playlists";
import type { Settings, ThemeSetting } from "../state/settings";
import type { Status } from "../state/usePlaylists";
import { PlaylistsPanel } from "./PlaylistsPanel";

function Segmented<T extends string>(props: { id: string; value: T; options: Array<[T, Key]>; onPick: (v: T) => void }) {
  return (
    <div class="seg" role="radiogroup">
      {props.options.map(([v, label]) => (
        <button class="seg-item" key={v} data-focus={`${props.id}-${v}`} aria-pressed={props.value === v} onClick={() => props.onPick(v)}>
          {t(label)}
        </button>
      ))}
    </div>
  );
}

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  store: PlaylistStore;
  status: Status;
  onAddPlaylist: (input: string) => string | null;
  onSelectPlaylist: (id: string) => void;
  onAskDeletePlaylist: (id: string) => void;
}

export function SettingsView({ settings, onChange, store, status, onAddPlaylist, onSelectPlaylist, onAskDeletePlaylist }: Props) {
  useEffect(() => { focusFirst(document, store.list.length > 0 ? `pl-${store.activeId ?? store.list[0]?.id}` : "pl-url"); }, []);
  return (
    <div class="screen settings">
      <h2>{t("navSettings")}</h2>
      <PlaylistsPanel store={store} status={status} onAdd={onAddPlaylist} onSelect={onSelectPlaylist} onAskDelete={onAskDeletePlaylist} />
      <div class="setting">
        <div class="setting-title">{t("settingsTheme")}</div>
        <Segmented<ThemeSetting>
          id="theme" value={settings.theme}
          options={[["system", "themeSystem"], ["dark", "themeDark"], ["light", "themeLight"]]}
          onPick={(theme) => onChange({ ...settings, theme })}
        />
      </div>
      <div class="setting">
        <div class="setting-title">{t("settingsMotion")}</div>
        <Segmented<MotionSetting>
          id="motion" value={settings.motion}
          options={[["auto", "motionAuto"], ["on", "motionOn"], ["off", "motionOff"]]}
          onPick={(motion) => onChange({ ...settings, motion })}
        />
        <div class="setting-hint">{t("settingsMotionHint")}</div>
      </div>
    </div>
  );
}
