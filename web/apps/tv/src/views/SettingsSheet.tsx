import { useEffect } from "preact/hooks";
import { Drawer, focusFirst, Icon, type IconName } from "@skmate/ui";
import type { GuideData, SourceOutcome } from "@skmate/epg";
import { t, type Key } from "../i18n";
import type { PlaylistEntry, PlaylistStore } from "../state/playlists";
import type { ProfileBook } from "../state/scope";
import type { Settings } from "../state/settings";
import type { GuideStatus } from "../state/useGuide";
import type { Status } from "../state/usePlaylists";
import { AboutPanel } from "./AboutPanel";
import { BackupPanel } from "./BackupPanel";
import { EpgPanel } from "./EpgPanel";
import { PlayerSettingRows } from "./PlayerRows";
import { PlaylistsPanel } from "./PlaylistsPanel";
import { ProfilesPanel } from "./ProfilesPanel";
import { SettingRow } from "./SettingRow";
import { SheetHead } from "./SheetHead";
import { platformLabel, SystemPanel } from "./SystemPanel";

export type Page = "player" | "look" | "playlists" | "epg" | "profiles" | "system" | "backup" | "about";

const META: Record<Page, { icon: IconName; title: Key }> = {
  player: { icon: "play_circle", title: "sheetPlayer" },
  look: { icon: "palette", title: "sheetLook" },
  playlists: { icon: "playlist", title: "sheetPlaylists" },
  epg: { icon: "epg", title: "sheetEpg" },
  profiles: { icon: "person", title: "sheetProfiles" },
  system: { icon: "settings", title: "sheetSystem" },
  backup: { icon: "backup", title: "sheetBackup" },
  about: { icon: "info", title: "sheetAbout" },
};

/** The menu as on the phone: small section captions, a title and what it is set to under each row. */
const MENU: Array<[Key, Page[]]> = [
  ["sectionPlayback", ["player"]],
  ["sectionLook", ["look"]],
  ["sectionSources", ["playlists", "epg", "profiles"]],
  ["sectionApp", ["system", "backup", "about"]],
];

const FIRST: Record<Page, string> = {
  player: "s-engine", look: "s-theme", playlists: "pl-url", epg: "s-epgauto", profiles: "pf-name", system: "s-lang", backup: "bk-save", about: "about-t.me/skmatetv",
};

interface Props {
  show: boolean;
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
  book: ProfileBook;
  onSwitchProfile: (id: string) => void;
  onAddProfile: (name: string) => void;
  onAskDeleteProfile: (id: string) => void;
  onQr: (name: string, address: string) => void;
  onRedoWizard: () => void;
}

/** Settings as a sheet from the right edge: a menu of sections, each opening its rows in the same sheet. */
export function SettingsSheet(p: Props) {
  const { settings: s, onChange, page } = p;
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => onChange({ ...s, [k]: v });
  useEffect(() => { if (p.show) focusFirst(document, page ? FIRST[page] : "sheet-player"); }, [page, p.show]);

  const engine = { auto: t("engAuto"), native: t("engNative"), hls: t("engHls"), mpegts: t("engMpegts") }[s.engine];
  const density = { 72: t("rowCompact"), 84: t("rowNormal"), 96: t("rowLarge") }[s.rowSize];
  const theme = { system: t("themeSystem"), dark: t("themeDark"), light: t("themeLight") }[s.theme];
  const me = p.book.profiles.find((x) => x.id === p.book.activeId);
  const subtitle: Record<Page, string> = {
    player: engine,
    look: `${theme} · ${density}`,
    playlists: p.store.list.length === 0 ? t("noPlaylist") : (p.active?.name ?? ""),
    epg: p.guide.data.linked > 0 ? t("epgOk", { linked: p.guide.data.linked, n: p.guide.data.programmeCount }) : t("epgNever"),
    profiles: me ? (me.guest ? t("guestName") : me.name) : "",
    system: `${platformLabel()} · ${__APP_VERSION__}`,
    backup: t("bkSaveHint"),
    about: `${t("aboutLicense")}`,
  };

  return (
    <Drawer side="right" width={980} label={t("sheetTitle")} onClose={p.onClose} closing={!p.show}>
      {page === null ? (
        <>
          <SheetHead title={t("sheetTitle")} />
          <div class="drawer-scroll">
            {MENU.map(([section, pages]) => (
              <div key={section}>
                <div class="caption">{t(section)} <span>{pages.length}</span></div>
                {pages.map((id) => (
                  <button class="menu-row two" key={id} data-focus={`sheet-${id}`} onClick={() => p.onPage(id)}>
                    <Icon name={META[id].icon} size={40} />
                    <span class="grow">
                      <span class="mr-title">{t(META[id].title)}</span>
                      <span class="mr-sub">{subtitle[id]}</span>
                    </span>
                    <Icon name="chevron" size={28} />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <SheetHead title={t(META[page].title)} right={page === "about" ? __APP_VERSION__ : undefined} />
          <div class="drawer-body drawer-scroll">
            {page === "player" ? <PlayerSettingRows settings={s} onChange={onChange} /> : null}
            {page === "look" ? (
              <>
                <SettingRow id="s-theme" title="settingsTheme" hint="settingsThemeHint" value={s.theme} onPick={set("theme")}
                  options={[{ value: "system", label: t("themeSystem") }, { value: "dark", label: t("themeDark") }, { value: "light", label: t("themeLight") }]} />
                <SettingRow id="s-motion" title="settingsMotion" hint="settingsMotionHint" value={s.motion} onPick={set("motion")}
                  options={[{ value: "auto", label: t("motionAuto") }, { value: "on", label: t("motionOn") }, { value: "off", label: t("motionOff") }]} />
                <SettingRow id="s-rows" title="setRowSize" hint="setRowSizeHint" value={s.rowSize} onPick={set("rowSize")}
                  options={[{ value: 72, label: t("rowCompact") }, { value: 84, label: t("rowNormal") }, { value: 96, label: t("rowLarge") }]} />
                <SettingRow id="s-scale" title="setUiScale" hint="setUiScaleHint" value={s.uiScale} onPick={set("uiScale")}
                  options={[80, 90, 100].map((n) => ({ value: n as Settings["uiScale"], label: t("percent", { n }) }))} />
                <SettingRow id="s-logos" title="setShowLogos" hint="setShowLogosHint" value={s.showLogos} onPick={set("showLogos")}
                  options={[{ value: false, label: t("off") }, { value: true, label: t("on") }]} />
                <SettingRow id="s-numbers" title="setShowNumbers" hint="setShowNumbersHint" value={s.showNumbers} onPick={set("showNumbers")}
                  options={[{ value: false, label: t("off") }, { value: true, label: t("on") }]} />
                <SettingRow id="s-program" title="setShowProgram" hint="setShowProgramHint" value={s.showProgram} onPick={set("showProgram")}
                  options={[{ value: false, label: t("off") }, { value: true, label: t("on") }]} />
              </>
            ) : null}
            {page === "playlists" ? (
              <PlaylistsPanel store={p.store} status={p.status} onAdd={p.onAddPlaylist} onSelect={p.onSelectPlaylist} onAskDelete={p.onAskDeletePlaylist} />
            ) : null}
            {page === "epg" ? (
              <EpgPanel settings={s} onChange={onChange} data={p.guide.data} status={p.guide.status} outcomes={p.guide.outcomes}
                channelCount={p.channelCount} active={p.active} headerGuides={p.headerGuides} onRefresh={p.guide.onRefresh} onClear={p.guide.onClear} />
            ) : null}
            {page === "profiles" ? (
              <ProfilesPanel book={p.book} onSwitch={p.onSwitchProfile} onAdd={p.onAddProfile} onAskDelete={p.onAskDeleteProfile} />
            ) : null}
            {page === "system" ? <SystemPanel settings={s} onChange={onChange} onQr={p.onQr} onReset={p.onAskReset} onRedo={p.onRedoWizard} /> : null}
            {page === "backup" ? <BackupPanel /> : null}
            {page === "about" ? <AboutPanel onQr={p.onQr} /> : null}
          </div>
        </>
      )}
    </Drawer>
  );
}
