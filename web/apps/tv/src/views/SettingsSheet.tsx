import { useEffect } from "preact/hooks";
import { Drawer, focusFirst, Icon, type IconName } from "@skmate/ui";
import { t, type Key } from "../i18n";
import type { PlaylistStore } from "../state/playlists";
import type { Settings } from "../state/settings";
import type { Status } from "../state/usePlaylists";
import type { GuideData, SourceOutcome } from "@skmate/epg";
import type { PlaylistEntry } from "../state/playlists";
import type { GuideStatus } from "../state/useGuide";
import { EpgPanel } from "./EpgPanel";
import { PlayerSettingRows } from "./PlayerRows";
import { PlaylistsPanel } from "./PlaylistsPanel";
import { SettingRow } from "./SettingRow";

export type Page = "player" | "look" | "playlists" | "epg" | "more";
const PAGES: Array<[Page, IconName, Key]> = [
  ["player", "play_circle", "sheetPlayer"],
  ["look", "palette", "sheetLook"],
  ["playlists", "playlist", "sheetPlaylists"],
  ["epg", "epg", "sheetEpg"],
  ["more", "info", "sheetMore"],
];

interface Props {
  page: Page | null;
  onPage: (p: Page | null) => void;
  onClose: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
  store: PlaylistStore;
  status: Status;
  onAddPlaylist: (input: string) => string | null;
  onSelectPlaylist: (id: string) => void;
  onAskDeletePlaylist: (id: string) => void;
  onAskReset: () => void;
  guide: { data: GuideData; status: GuideStatus; outcomes: SourceOutcome[]; onRefresh: () => void; onClear: () => void };
  channelCount: number;
  active: PlaylistEntry | null;
  headerGuides: string[];
}

/** Settings as a sheet from the right edge: a menu of sections, each opening its rows in the same sheet. */
export function SettingsSheet(p: Props) {
  const { settings: s, onChange, page } = p;
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => onChange({ ...s, [k]: v });
  useEffect(() => { focusFirst(document, page ? FIRST[page] : "sheet-player"); }, [page]);

  return (
    <Drawer side="left" width={980} label={t("sheetTitle")} onClose={p.onClose}>
      {page === null ? (
        <>
          <div class="drawer-title">{t("sheetTitle")}</div>
          {PAGES.map(([id, icon, label]) => (
            <button class="menu-row" key={id} data-focus={`sheet-${id}`} onClick={() => p.onPage(id)}>
              <Icon name={icon} size={40} />
              <span class="grow">{t(label)}</span>
              <Icon name="chevron" size={28} />
            </button>
          ))}
        </>
      ) : (
        <>
          <div class="drawer-head">
            <button class="drawer-back" data-focus="sheet-back" aria-label={t("backBtn")} onClick={() => p.onPage(null)}><Icon name="back" size={36} /></button>
            <div class="drawer-title">{t(PAGES.find(([id]) => id === page)?.[2] ?? "sheetTitle")}</div>
          </div>
          <div class="drawer-body">
            {page === "player" ? <PlayerSettingRows settings={s} onChange={onChange} /> : null}
            {page === "look" ? (
              <>
                <SettingRow id="s-theme" title="settingsTheme" hint="settingsThemeHint" value={s.theme} onPick={set("theme")}
                  options={[{ value: "system", label: t("themeSystem") }, { value: "dark", label: t("themeDark") }, { value: "light", label: t("themeLight") }]} />
                <SettingRow id="s-motion" title="settingsMotion" hint="settingsMotionHint" value={s.motion} onPick={set("motion")}
                  options={[{ value: "auto", label: t("motionAuto") }, { value: "on", label: t("motionOn") }, { value: "off", label: t("motionOff") }]} />
              </>
            ) : null}
            {page === "playlists" ? (
              <PlaylistsPanel store={p.store} status={p.status} onAdd={p.onAddPlaylist} onSelect={p.onSelectPlaylist} onAskDelete={p.onAskDeletePlaylist} />
            ) : null}
            {page === "epg" ? (
              <EpgPanel settings={s} onChange={onChange} data={p.guide.data} status={p.guide.status} outcomes={p.guide.outcomes}
                channelCount={p.channelCount} active={p.active} headerGuides={p.headerGuides} onRefresh={p.guide.onRefresh} onClear={p.guide.onClear} />
            ) : null}
            {page === "more" ? (
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
        </>
      )}
    </Drawer>
  );
}

const FIRST: Record<Page, string> = { player: "s-engine", look: "s-theme", playlists: "pl-url", epg: "s-epgauto", more: "s-lang" };
