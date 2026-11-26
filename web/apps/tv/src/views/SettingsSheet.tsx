import { useEffect, useRef } from "preact/hooks";
import { Drawer, focusFirst, Icon, Presence, type IconName } from "@skmate/ui";
import type { GuideData, SourceOutcome } from "@skmate/epg";
import { t, type Key } from "../i18n";
import type { PlaylistEntry, PlaylistStore } from "../state/playlists";
import type { ProfileBook } from "../state/scope";
import type { Settings } from "../state/settings";
import type { GuideStatus } from "../state/useGuide";
import type { Status } from "../state/usePlaylists";
import { AboutPanel } from "./AboutPanel";
import { BackupPanel } from "./BackupPanel";
import { EpgPanel, guideLine } from "./EpgPanel";
import { PlayerSettingRows } from "./PlayerRows";
import { PlaylistsPanel } from "./PlaylistsPanel";
import { ProfilesPanel } from "./ProfilesPanel";
import { SettingRow } from "./SettingRow";
import { SheetHead } from "./SheetHead";
import type { UpdateState } from "../state/useUpdates";
import { SystemPanel } from "./SystemPanel";
import { LANGUAGES } from "../i18n/languages";
import "./settings.css";

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

/**
 * The menu as in TiviMate and Android TV: one plain list, each row its name and what it is set to now, all eight on one
 * screen. What a viewer opens most comes first: the playlists and the guide, then how channels play and look, the app.
 */
const MENU: Page[] = ["playlists", "epg", "player", "look", "profiles", "system", "backup", "about"];

const FIRST: Record<Page, string> = {
  player: "s-engine", look: "s-theme", playlists: "pl-add-open", epg: "epg-refresh", profiles: "pf-name", system: "s-lang", backup: "bk-save", about: "about-t.me/skmatetv",
};

interface Props {
  show: boolean;
  page: Page | null;
  onPage: (p: Page | null) => void;
  onClose: () => void;
  /** One step back from an open section: to the menu, or wherever the section was opened from. */
  onBack: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
  store: PlaylistStore;
  status: Status;
  onAddPlaylist: (input: string) => string | null;
  onAddPlaylistFile: (name: string, text: string) => Promise<string | null>;
  onSelectPlaylist: (id: string) => void;
  onEditPlaylist: (id: string, name: string, url: string) => string | null;
  onAskDeletePlaylist: (id: string) => void;
  onAskReset: () => void;
  guide: { data: GuideData; status: GuideStatus; outcomes: SourceOutcome[]; onRefresh: () => void; onClear: () => void };
  channelCount: number;
  active: PlaylistEntry | null;
  headerGuides: string[];
  book: ProfileBook;
  onSwitchProfile: (id: string) => void;
  onAddProfile: (name: string) => void;
  onRenameProfile: (name: string) => void;
  onAskDeleteProfile: (id: string) => void;
  /** The active profile's lock and kids setting. */
  onSetPin: () => void;
  onRemovePin: () => void;
  onToggleKids: () => void;
  onQr: (name: string, address: string) => void;
  onRedoWizard: () => void;
  update: { state: UpdateState; check: () => void; install: () => void };
}

/** Settings as a sheet from the bottom: a menu of sections, each opening its rows in a sheet of its own on top. */
export function SettingsSheet(p: Props) {
  const { settings: s, onChange, page } = p;
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => onChange({ ...s, [k]: v });
  // A section opens on its first control; back on the menu, the focus is on the section just left.
  const left = useRef<Page | null>(null);
  useEffect(() => {
    if (p.show) focusFirst(document, page === "profiles" ? (me?.guest ? "pf-kids" : `pf-${p.book.activeId}`)
      : page === "playlists" && p.store.activeId ? `pl-${p.store.activeId}` // the playlist in use first; the form is under the list
      : page ? FIRST[page] : `sheet-${left.current ?? "playlists"}`);
    if (page) left.current = page;
  }, [page, p.show]);

  const aspect = { fit: t("aspFit"), fill: t("aspFill"), cover: t("aspCover") }[s.aspect];
  const density = { 72: t("rowCompact"), 84: t("rowNormal"), 96: t("rowLarge") }[s.rowSize];
  const theme = { system: t("themeSystem"), dark: t("themeDark"), light: t("themeLight") }[s.theme];
  const language = s.language === "auto" ? t("langAuto") : (LANGUAGES.find((l) => l.code === s.language)?.name ?? s.language);
  const me = p.book.profiles.find((x) => x.id === p.book.activeId);
  // Under each section: what it is set to now, in the words of its own rows.
  const subtitle: Record<Page, string> = {
    player: `${t("setAspect")}: ${aspect}`,
    look: `${t("settingsTheme")}: ${theme} · ${t("setRowSize")}: ${density}`,
    playlists: p.store.list.length === 0 ? t("noPlaylist") : t("menuPlSub", { name: p.active?.name ?? t("noPlaylist"), n: p.store.list.length }),
    epg: p.guide.status.kind === "syncing" ? t("epgRefreshing") : guideLine(p.guide.data, p.channelCount),
    profiles: me ? (me.guest ? t("guestName") : me.name) : "",
    system: `${t("setLanguage")}: ${language} · ${t("sysVersion")} ${__APP_VERSION__}`,
    backup: t("bkSaveHint"),
    about: t("aboutLicense"),
  };

  // One page of settings, as its own sheet on top of the menu.
  const pageSheet = (pg: Page) => (
        <>
          <SheetHead title={t(META[pg].title)} right={pg === "about" ? __APP_VERSION__ : undefined} />
          <div class="drawer-body drawer-scroll">
            {pg === "player" ? <PlayerSettingRows settings={s} onChange={onChange} /> : null}
            {pg === "look" ? (
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
            {pg === "playlists" ? (
              <PlaylistsPanel store={p.store} status={p.status} channelCount={p.channelCount} onAdd={p.onAddPlaylist} onAddFile={p.onAddPlaylistFile} onSelect={p.onSelectPlaylist} onEdit={p.onEditPlaylist} onAskDelete={p.onAskDeletePlaylist} />
            ) : null}
            {pg === "epg" ? (
              <EpgPanel settings={s} onChange={onChange} data={p.guide.data} status={p.guide.status} outcomes={p.guide.outcomes}
                channelCount={p.channelCount} active={p.active} headerGuides={p.headerGuides} onRefresh={p.guide.onRefresh} onClear={p.guide.onClear} />
            ) : null}
            {pg === "profiles" ? (
              <ProfilesPanel book={p.book} onSwitch={p.onSwitchProfile} onAdd={p.onAddProfile} onRename={p.onRenameProfile} onAskDelete={p.onAskDeleteProfile}
                onSetPin={p.onSetPin} onRemovePin={p.onRemovePin} onToggleKids={p.onToggleKids} />
            ) : null}
            {pg === "system" ? <SystemPanel settings={s} onChange={onChange} onQr={p.onQr} onReset={p.onAskReset} onRedo={p.onRedoWizard} update={p.update} /> : null}
            {pg === "backup" ? <BackupPanel /> : null}
            {pg === "about" ? <AboutPanel onQr={p.onQr} /> : null}
          </div>
        </>
  );

  // The menu is a sheet from the bottom; a section opened from it is another sheet rising over it, and Back lowers only
  // that one, so the menu is there again under it.
  return (
    <>
      <Drawer side="bottom" label={t("sheetTitle")} onClose={p.onClose} closing={!p.show} returnFocus>
        <>
          <SheetHead title={t("sheetTitle")} />
          <div class="drawer-scroll">
            {MENU.map((id) => (
              <button class="menu-row two" key={id} data-focus={`sheet-${id}`} onClick={() => p.onPage(id)}>
                <Icon name={META[id].icon} size={40} />
                <span class="grow">
                  <span class="mr-title">{t(META[id].title)}</span>
                  <span class="mr-sub">{subtitle[id]}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      </Drawer>
      <Presence show={p.show && page !== null}>
        {(out) => (
          <Drawer side="bottom" label={page ? t(META[page].title) : t("sheetTitle")} onClose={p.onBack} closing={out}>
            {page ? pageSheet(page) : null}
          </Drawer>
        )}
      </Presence>
    </>
  );
}
