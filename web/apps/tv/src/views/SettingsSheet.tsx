import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Drawer, focusFirst, isBack, useOwnBack } from "@skmate/ui";
import type { GuideData, SourceOutcome } from "@skmate/epg";
import type { Channel } from "@skmate/core";
import { t, type Key } from "../i18n";
import { desktop, usePlayers } from "../state/desktop";
import type { PlaylistEntry, PlaylistStore } from "../state/playlists";
import type { ProfileBook } from "../state/scope";
import type { Settings } from "../state/settings";
import type { GuideStatus } from "../state/useGuide";
import type { Status } from "../state/usePlaylists";
import type { UpdateState } from "../state/useUpdates";
import { AboutPanel } from "./AboutPanel";
import { BackupPanel } from "./BackupPanel";
import { Confirm } from "./Confirm";
import { EpgPanel, epgSourceCount } from "./EpgPanel";
import { PlaylistsPanel } from "./PlaylistsPanel";
import { ProfilesPanel } from "./ProfilesPanel";
import { SheetCtx, SHeading, SIcon, SNote, SRow, EditorLayer, tf, type SheetApi, OverSheet } from "./SettingsKit";
import {
  BrowsingPage, ChNavPage, DnsPage, FontsPage, GlassPage, GuideWidthPage, LanguagePage, MenusPage, NotHerePage, PanelWidthPage,
  ProxyPage, SyncPage, TelegramPage, WeatherPage,
} from "./SettingsPages";
import { HelpPage } from "./HelpPages";
import { buildRows, GROUP_ITEMS, homeGroup, type Confirmation, type RowDef } from "./SettingsRows";
import { SyncDialog } from "./SyncDialog";
import { UpdatePopup } from "./UpdateDialog";
import "./settings.css";

/** The sheet's pages: the eleven groups, the lower block of the list, and "playlists" (opened straight from a screen). */
export type Page =
  | "quick" | "profile" | "sources" | "appearance" | "layout" | "content" | "player" | "picture" | "live" | "watching" | "app"
  | "backup" | "sync" | "telegram" | "help" | "about" | "playlists";

/** The list (MorePages.kt SettingsCards + MoreScreen.kt extras): icon and the short name, which is also the page title. */
const GROUPS: Array<{ id: Page; icon: string; title: Key }> = [
  { id: "quick", icon: "STAR", title: "sa_settings_short_quick" },
  { id: "profile", icon: "PERSON", title: "sa_settings_short_profile" },
  { id: "sources", icon: "LIST", title: "sa_settings_short_sources" },
  { id: "appearance", icon: "PALETTE", title: "sa_settings_short_appearance" },
  { id: "layout", icon: "GRID", title: "sa_settings_short_layout" },
  { id: "content", icon: "MOVIES", title: "sa_settings_short_content" },
  { id: "player", icon: "PLAY_CIRCLE", title: "sa_settings_short_player" },
  { id: "picture", icon: "EXPAND", title: "sa_settings_short_picture" },
  { id: "live", icon: "LIVE_TV", title: "sa_settings_short_live" },
  { id: "watching", icon: "REC", title: "sa_settings_short_watching" },
  { id: "app", icon: "GEAR", title: "sa_settings_short_app" }, // Android 2.5.5 (40de217): the gear, not ⓘ
];
const EXTRAS: Array<{ id: Page; icon: string; title: Key }> = [
  { id: "backup", icon: "DOWNLOADS", title: "sa_settings_short_backup" },
  { id: "sync", icon: "PHONE", title: "sa_settings_short_sync" },
  { id: "telegram", icon: "SEND", title: "sa_settings_short_telegram" },
  // Android 2.5.5 (40de217): «Как пользоваться» with a question mark, «О приложении» with </>.
  { id: "help", icon: "HELP", title: "sa_help_title" },
  { id: "about", icon: "CODE", title: "sa_settings_short_about" },
];
/** A page's title where it differs from its line in the list (MoreScreen.kt InSheet titles). */
const PAGE_TITLE: Partial<Record<Page, Key>> = {
  backup: "sa_settings_backup_restore", sync: "sa_local_sync_title", telegram: "sa_settings_tg_remote", about: "sa_settings_about", playlists: "sa_settings_playlists",
};
/** The rows that open a page of their own, and that page's title. */
const SUBS: Record<string, Key> = {
  tab_SOURCES: "sa_settings_playlists", tab_EPG: "sa_settings_epg_sources", tab_GLASS_EFFECT: "sa_settings_glass_bg_title",
  fonts: "sa_settings_title_fonts", tab_WEATHER: "sa_settings_title_date_time_weather", tab_CH_NAV: "sa_settings_ch_paging",
  tab_PANEL_WIDTH: "sa_settings_panel_width", tab_GUIDE_WIDTH: "sa_settings_guide_width", browsing_lists: "sa_settings_browsing_lists",
  tab_CONTENT_MENUS: "sa_settings_content_menus_title", tab_CUSTOMIZE: "sa_settings_customize_title", tab_SPORTS: "sa_sports_title",
  tab_LANGUAGE: "sa_settings_language", tab_TG_REMOTE: "sa_settings_tg_remote", tab_NETWORK: "sa_common_proxy", tab_DNS: "sa_settings_dns",
  // screens 2.5.4: the recording rows (a TV browser cannot record): their page says it is only in the Android TV app.
  rec_reserve: "sa_settings_recording_reserve", rec_watching: "sa_settings_record_watching",
  rec_pre_roll: "sa_settings_recording_pre_roll", rec_post_roll: "sa_settings_recording_post_roll",
};
/** "Закреплено из раздела «…»" names the full group (SettingsGroup.titleRes). */
const GROUP_NAME: Record<string, Key> = {
  player: "sa_settings_vp_cat_player", picture: "sa_settings_vp_cat_picture", live: "sa_settings_live_tv", watching: "sa_settings_group_watching_recording",
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
  /** screens 2.5.4: Мой профиль › «Взрослые каналы по PIN» (off asks the PIN). */
  onToggleAdultLock: () => void;
  onQr: (name: string, address: string) => void;
  onRedoWizard: () => void;
  update: { state: UpdateState; check: () => void; install: () => void };
  /** The channels of the playlist in use (the startup channel picker). */
  channels?: readonly Channel[];
}

/**
 * Settings as Android's sheet on the right (SettingsStage.kt SettingsSheet, MorePages.kt SettingsGroupList): the list of
 * groups, a group's page (headings and rows), a row's own page, and the choice list or stepper a row opens over the
 * rows. Pages change at once, as on Android; Back goes one step: editor → page → group → list → closed.
 */
export function SettingsSheet(p: Props) {
  const { settings: s, page } = p;
  const players = usePlayers();
  const [sub, setSub] = useState<string | null>(null);
  const [editor, setEditor] = useState<string | null>(null);
  const [pinMenu, setPinMenu] = useState<string | null>(null);
  const [ask, setAsk] = useState<Confirmation | null>(null);
  const [updating, setUpdating] = useState(false);
  const [picking, setPicking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [dialogs, setDialogs] = useState<HTMLElement | null>(null);
  const backs = useRef<Array<() => void>>([]);
  const left = useRef<Page | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  /** The last control focused among the rows: where a question asked over the sheet gives the focus back. */
  const lastFocus = useRef<string | null>(null);

  // The sheet's own control first: an id like "pl-1" may also exist on the screen behind it.
  const focus = (id: string) => setTimeout(() => {
    const r = root.current;
    const here = !!r && Array.from(r.querySelectorAll<HTMLElement>("[data-focus]")).some((e) => e.dataset.focus === id);
    focusFirst(here && r ? r : document, id);
  }, 0);
  const set = (patch: Partial<Settings>) => p.onChange({ ...s, ...patch });
  const closeEditor = () => { const k = editor; setEditor(null); if (k) focus(`row-${k}`); };
  const closeSub = () => { const k = sub; setSub(null); setEditor(null); if (k) focus(`row-${k}`); };

  const throttled = typeof document !== "undefined" && document.documentElement.getAttribute("data-motion") === "off" && s.motion === "auto";
  const rows = buildRows({
    s, set, playlists: p.store.list, epgCount: epgSourceCount(s, p.active, p.headerGuides), players, throttled, channels: p.channels ?? [],
    ask: setAsk, openUpdate: () => setUpdating(true),
  }, closeEditor);

  const api: SheetApi = useMemo(() => ({
    closeEditor: () => undefined, focus, slot: null, dialogs: null,
    pushBack: (fn: () => void) => { backs.current.push(fn); return () => { backs.current = backs.current.filter((x) => x !== fn); }; },
  }), []);
  api.closeEditor = closeEditor;
  api.slot = slot;
  api.dialogs = dialogs;

  // Back, one step at a time; only while the sheet (or an editor over its rows) is the topmost dialog: a popup over
  // it answers Back itself.
  const step = useRef<() => void>(() => undefined);
  step.current = () => {
    const own = backs.current[backs.current.length - 1];
    if (own) { own(); return; }
    if (editor) { closeEditor(); return; }
    if (sub) { closeSub(); return; }
    if (page) p.onBack(); else p.onClose();
  };
  useEffect(() => {
    const mineOnTop = () => {
      const r = root.current;
      const layer = r?.querySelector(".st-sheet-layer[data-modal]");
      if (!r || !layer) return false;
      const all = document.querySelectorAll("[data-modal]");
      const last = all[all.length - 1];
      const rows = r.querySelector(".set-body-wrap");
      return last === layer || (!!rows && !!last && rows.contains(last));
    };
    const onKey = (e: KeyboardEvent) => {
      if (!isBack(e) || (document.activeElement instanceof HTMLInputElement && e.key === "Backspace") || !mineOnTop()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      step.current();
    };
    const onContext = (e: MouseEvent) => {
      if (!mineOnTop()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      step.current();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("contextmenu", onContext, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("contextmenu", onContext, true);
    };
  }, []);

  // A page opens on its first control; back on the list, the focus is on the line just left.
  useEffect(() => {
    setSub(null); setEditor(null);
    if (!p.show) return;
    if (page) left.current = page === "playlists" ? left.current : page;
    setTimeout(() => {
      if (body.current) body.current.scrollTop = 0;
      if (!page) { focusFirst(root.current ?? document, `sheet-${left.current ?? "quick"}`); return; }
      if (page === "profile") { focusFirst(root.current ?? document, `pf-${p.book.activeId}`); return; }
      const first = body.current?.querySelector<HTMLElement>("[data-focus]");
      first?.focus();
    }, 0);
  }, [page, p.show]);
  useEffect(() => {
    if (!sub) return;
    setTimeout(() => { if (body.current) body.current.scrollTop = 0; body.current?.querySelector<HTMLElement>("[data-focus]")?.focus(); }, 0);
  }, [sub]);

  /** Keep one row of room ahead of the focused row (LiveStage.kt edgeScrollSpec). */
  const onFocusIn = (e: FocusEvent) => {
    const box = body.current;
    const el = e.target as HTMLElement;
    if (!box || !box.contains(el)) return;
    if (el.dataset.focus) lastFocus.current = el.dataset.focus;
    let top = 0;
    for (let n: HTMLElement | null = el; n && n !== box; n = n.offsetParent as HTMLElement | null) top += n.offsetTop;
    const room = 92;
    const bottom = top + el.offsetHeight;
    if (top - room < box.scrollTop) box.scrollTop = Math.max(0, top - room);
    else if (bottom + room > box.scrollTop + box.clientHeight) box.scrollTop = bottom + room - box.clientHeight;
  };

  const okOf = (r: RowDef) => r.ok ?? (r.editor ? () => setEditor(r.key) : SUBS[r.key] ? () => setSub(r.key) : undefined);
  const rowView = (r: RowDef, inQuick = false) => {
    const home = homeGroup(r.key);
    const line = inQuick && r.key.startsWith("vp_") && home && GROUP_NAME[home] ? tf("sa_settings_pinned_from", t(GROUP_NAME[home]!)) : r.line;
    return (
      <SRow key={r.key} id={`row-${r.key}`} icon={r.icon} title={r.title} line={line} end={r.end} disabled={r.disabled}
        pinned={!inQuick && s.quickPinned.includes(r.key)} marked={editor === r.key}
        onOk={okOf(r)} onStep={r.step} onHold={r.pin ? () => setPinMenu(r.key) : undefined} />
    );
  };

  const groupRows = (g: string) => {
    const items = GROUP_ITEMS[g] ?? [];
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (typeof it === "string") { const r = rows[it]; if (r && !r.hidden) out.push(rowView(r)); continue; }
      // A heading over at least one row that is shown.
      let any = false;
      for (let j = i + 1; j < items.length && typeof items[j] === "string"; j++) { const r = rows[items[j] as string]; if (r && !r.hidden) any = true; }
      if (any) out.push(<SHeading key={`h-${it.h}`} text={t(it.h)} first={it.first} />);
    }
    return out;
  };

  const quickRows = () => {
    const shown = s.quickPinned.map((k) => rows[k]).filter((r): r is RowDef => !!r && !r.hidden);
    if (shown.length === 0) return <SNote title={t("sa_settings_quick_empty_title")} body={t("sa_settings_quick_empty_hint")} />;
    return shown.map((r) => rowView(r, true));
  };

  const subPage = (k: string) => {
    const P = { s, set };
    switch (k) {
      case "tab_SOURCES": return playlists();
      case "tab_EPG": return (
        <EpgPanel settings={s} onChange={p.onChange} data={p.guide.data} status={p.guide.status} outcomes={p.guide.outcomes}
          channelCount={p.channelCount} active={p.active} headerGuides={p.headerGuides} onRefresh={p.guide.onRefresh} onClear={p.guide.onClear} />
      );
      case "tab_GLASS_EFFECT": return <GlassPage {...P} />;
      case "fonts": return <FontsPage {...P} />;
      case "tab_WEATHER": return <WeatherPage {...P} />;
      case "tab_CH_NAV": return <ChNavPage {...P} />;
      case "tab_PANEL_WIDTH": return <PanelWidthPage />;
      case "tab_GUIDE_WIDTH": return <GuideWidthPage />;
      case "browsing_lists": return <BrowsingPage {...P} />;
      case "tab_CONTENT_MENUS": return <MenusPage />;
      case "tab_LANGUAGE": return <LanguagePage {...P} />;
      case "tab_TG_REMOTE": return <TelegramPage />;
      case "tab_NETWORK": return <ProxyPage {...P} />;
      case "tab_DNS": return <DnsPage {...P} />;
      default: return <NotHerePage />;
    }
  };

  const playlists = () => (
    <PlaylistsPanel store={p.store} status={p.status} channelCount={p.channelCount} onAdd={p.onAddPlaylist} onAddFile={p.onAddPlaylistFile}
      onSelect={p.onSelectPlaylist} onEdit={p.onEditPlaylist} onAskDelete={p.onAskDeletePlaylist} />
  );

  const pageBody = (pg: Page) => {
    if (sub) return subPage(sub);
    switch (pg) {
      case "quick": return quickRows();
      case "profile": return (
        <ProfilesPanel book={p.book} onSwitch={p.onSwitchProfile} onAdd={p.onAddProfile} onRename={p.onRenameProfile} onAskDelete={p.onAskDeleteProfile}
          onSetPin={p.onSetPin} onRemovePin={p.onRemovePin} onToggleKids={p.onToggleKids}
          adultLock={s.adultLock} onToggleAdultLock={p.onToggleAdultLock} />
      );
      case "backup": return <BackupPanel playlists={p.store.list.length} />;
      case "sync": return <SyncPage onDesktop={desktop() ? () => setSyncing(true) : null} />;
      case "telegram": return <TelegramPage />;
      case "help": return <HelpPage />;
      case "about": return <AboutPanel onQr={p.onQr} />;
      case "playlists": return playlists();
      default: return groupRows(pg);
    }
  };

  const title = sub ? t(SUBS[sub] ?? "sa_common_nav_settings")
    : page ? t(PAGE_TITLE[page] ?? [...GROUPS, ...EXTRAS].find((g) => g.id === page)?.title ?? "sa_common_nav_settings")
      : t("sa_common_nav_settings");
  const editorRow = editor ? rows[editor] : undefined;

  const list = (
    <>
      {GROUPS.map((g) => <Line key={g.id} id={`sheet-${g.id}`} icon={g.icon} title={t(g.title)} onClick={() => p.onPage(g.id)} />)}
      <div class="set-sep" />
      {EXTRAS.map((g) => <Line key={g.id} id={`sheet-${g.id}`} icon={g.icon} title={t(g.title)} onClick={() => p.onPage(g.id)} />)}
      <Line id="sheet-switch" icon="PERSON" title={t("sa_more_profile_switch")} onClick={() => setPicking(true)} />
    </>
  );

  return (
    <SheetCtx.Provider value={api}>
      <div ref={root}>
        <Drawer
          variant="sheet" label={title} onClose={() => (page ? p.onBack() : p.onClose())} closing={!p.show} returnFocus
          // 2.5.8: How to use has no title of its own: the questions start at once.
          title={page === "help" && !sub ? undefined : title}
          className={page && !sub ? `set-page-${page}` : undefined}
          tools={page === "about" && !sub ? <span class="set-version">{__APP_VERSION__.split("-")[0]}</span> : undefined}
        >
          <div class="set-body-wrap">
            <div class={`st-sheet-body${page === "about" ? " flush" : ""}`} ref={body} onFocusIn={onFocusIn as never}>
              {page ? pageBody(page) : list}
            </div>
            <div class="set-slot" ref={setSlot as never} />
            {editorRow?.editor ? <EditorLayer title={editorRow.title}>{editorRow.editor()}</EditorLayer> : null}
          </div>
        </Drawer>
        <div class="set-dialogs" ref={setDialogs as never} />
      </div>
      {pinMenu && rows[pinMenu] ? (
        <PinMenu row={rows[pinMenu]!} pinned={s.quickPinned} inQuick={page === "quick"}
          onChange={(list, focusKey) => { set({ quickPinned: list }); setPinMenu(null); focus(`row-${focusKey}`); }}
          onClose={() => { const k = pinMenu; setPinMenu(null); focus(`row-${k}`); }} />
      ) : null}
      {ask ? (
        <Confirm title={ask.title} body={ask.body} confirm={ask.confirm} cancel={ask.cancel}
          onConfirm={() => { setAsk(null); ask.onConfirm(); if (lastFocus.current) focus(lastFocus.current); }}
          onCancel={() => { setAsk(null); ask.onCancel?.(); if (lastFocus.current) focus(lastFocus.current); }} />
      ) : null}
      {updating ? <UpdatePopup state={p.update.state} check={p.update.check} install={p.update.install} onClose={() => { setUpdating(false); focus("row-check_updates"); }} /> : null}
      {picking ? <ProfilePick book={p.book} onPick={(id) => { setPicking(false); if (id !== p.book.activeId) p.onSwitchProfile(id); else focus("sheet-switch"); }} onClose={() => { setPicking(false); focus("sheet-switch"); }} /> : null}
      {syncing ? <SyncDialog onClose={() => setSyncing(false)} /> : null}
    </SheetCtx.Provider>
  );
}

/** A group in the list (MorePages.kt GroupLine): 80 high, a 32 icon at 85%, one bold name. */
function Line(p: { id: string; icon: string; title: string; onClick: () => void }) {
  return (
    <button class="st-focusable st-line" data-focus={p.id} onClick={p.onClick}>
      <span class="st-line-icon"><SIcon name={p.icon} size={32} /></span>
      <span class="st-line-text">{p.title}</span>
    </button>
  );
}

/** Hold OK on a row (SettingsScreen.kt SettingsRowMenu): pin to or unpin from Quick; inside Quick also move it up or down. */
function PinMenu(p: { row: RowDef; pinned: string[]; inQuick: boolean; onChange: (list: string[], focusKey: string) => void; onClose: () => void }) {
  const at = p.pinned.indexOf(p.row.key);
  const items: Array<{ icon: string; text: Key; run: () => void }> = [
    {
      icon: "SPARKLE", text: at >= 0 ? "sa_settings_row_menu_unpin" : "sa_settings_row_menu_pin",
      run: () => {
        if (at < 0) { p.onChange([...p.pinned, p.row.key], p.row.key); return; }
        const rest = p.pinned.filter((k) => k !== p.row.key);
        // Unpinned inside Quick: the focus goes to the row sliding into its place.
        p.onChange(rest, p.inQuick ? (p.pinned[at + 1] ?? p.pinned[at - 1] ?? p.row.key) : p.row.key);
      },
    },
  ];
  if (p.inQuick && at > 0) items.push({ icon: "CHEVRON_UP", text: "sa_settings_row_menu_move_up", run: () => { const l = p.pinned.slice(); l.splice(at, 1); l.splice(at - 1, 0, p.row.key); p.onChange(l, p.row.key); } });
  if (p.inQuick && at >= 0 && at < p.pinned.length - 1) items.push({ icon: "CHEVRON_DOWN", text: "sa_settings_row_menu_move_down", run: () => { const l = p.pinned.slice(); l.splice(at, 1); l.splice(at + 1, 0, p.row.key); p.onChange(l, p.row.key); } });
  return <MenuCard title={p.row.title} items={items.map((i) => ({ icon: i.icon, text: t(i.text), run: i.run }))} onClose={p.onClose} />;
}

/** «Сменить профиль»: the profiles to sign in to (the Android profile gate's choice), the one in use ticked. */
function ProfilePick(p: { book: ProfileBook; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <MenuCard title={t("sa_more_profile_switch")} onClose={p.onClose}
      items={p.book.profiles.map((x) => ({ icon: "PERSON", text: x.guest ? t("guestName") : x.name, checked: x.id === p.book.activeId, run: () => p.onPick(x.id) }))} />
  );
}

/** `StageMenu` 520 wide over the wash: the header, then the items (76 high, icon 28, a hairline under each). */
function MenuCard(p: { title: string; items: Array<{ icon: string; text: string; checked?: boolean; run: () => void }>; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useOwnBack(root, p.onClose);
  useEffect(() => { setTimeout(() => focusFirst(document, "pm-0"), 0); }, []);
  return (
    <OverSheet app>
      <div ref={root}>
        <div class="st-layer st-menu-layer center" data-modal onClick={p.onClose}>
          <div class="st-menu" role="dialog" aria-label={p.title} style={{ width: "520px" }} onClick={(e) => e.stopPropagation()}>
            <div class="st-menu-head"><span class="st-menu-text"><span class="st-menu-title" style={{ display: "block" }}>{p.title}</span></span></div>
            <div class="st-menu-list">
              {p.items.map((it, i) => (
                <button key={i} class="st-focusable st-menu-item" data-focus={`pm-${i}`} onClick={it.run}>
                  <SIcon name={it.icon} size={28} />
                  <span class="st-menu-item-text">{it.text}</span>
                  {it.checked ? <span class="st-check"><SIcon name="CHECK" size={22} /></span> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </OverSheet>
  );
}
