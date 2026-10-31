import { useEffect, useMemo, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { Icon, installDpad, Presence, watchFrames, type IconName } from "@skmate/ui";
import { applyLanguage, t, type Key } from "./i18n";
import { channelKey, loadFavorites, saveFavorites, toggle } from "./state/favorites";
import { applyAll, DEFAULTS, load, save, type Settings } from "./state/settings";
import { GuideContext } from "./state/GuideContext";
import { loadHistory, pushRecent, recentChannels, saveHistory } from "./state/history";
import { UiContext } from "./state/UiContext";
import { useGuide } from "./state/useGuide";
import { addProfile, firstBook, loadBook, purgeProfile, removeProfile, saveBook, switchProfile, type ProfileBook } from "./state/scope";
import { usePlaylists } from "./state/usePlaylists";
import { Confirm } from "./views/Confirm";
import { QrDialog } from "./views/QrDialog";
import { PlaylistPicker } from "./views/PlaylistPicker";
import { Wizard, type WizardResult } from "./views/Wizard";
import { GuideView } from "./views/GuideView";
import { LiveView } from "./views/LiveView";
import { PlayerView } from "./views/PlayerView";
import { SearchView } from "./views/SearchView";
import { SettingsSheet, type Page } from "./views/SettingsSheet";
import { SportView } from "./views/SportView";

type Section = "live" | "guide" | "sport" | "search";
/** The middle of the rail: the places you go; Settings sits apart at the bottom and opens as a sheet. */
const NAV: Array<[Section, IconName, Key]> = [
  ["live", "live_tv", "navLive"],
  ["guide", "epg", "navGuide"],
  ["sport", "sports", "navSport"],
  ["search", "search", "navSearch"],
];

export function App() {
  const [section, setSection] = useState<Section>("live");
  const [playing, setPlaying] = useState<{ list: readonly Channel[]; index: number } | null>(null);
  const [settings, setSettings] = useState<Settings>(load);
  const [throttled, setThrottled] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [book, setBook] = useState<ProfileBook | null>(loadBook);
  const [deletingProfile, setDeletingProfile] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [qr, setQr] = useState<{ name: string; address: string } | null>(null);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [leaving, setLeaving] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [redo, setRedo] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [sheetPage, setSheetPage] = useState<Page | null>(null);
  const pl = usePlaylists();
  const guide = useGuide(pl.channels, pl.active, pl.headerGuides, settings);
  const guideValue = useMemo(() => ({ data: guide.data, now: guide.now }), [guide.data, guide.now]);
  applyLanguage(settings.language); // before anything is drawn: the whole screen speaks one language

  useEffect(() => { applyAll(settings, throttled); save(settings); }, [settings, throttled]);
  useEffect(() => watchFrames(() => setThrottled(true)), []);
  // The pointer near the left edge brings the menu out, as Left does for the remote; away from it, it goes again.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (e.movementX === 0 && e.movementY === 0) return;
      const nav = document.querySelector(".rail");
      const inside = nav?.contains(document.activeElement);
      if (e.clientX < 24) setRailOpen(true);
      else if (e.clientX > 160 && !inside) setRailOpen(false);
    };
    document.addEventListener("mousemove", onMove, { passive: true });
    return () => document.removeEventListener("mousemove", onMove);
  }, []);
  useEffect(() => { saveFavorites(favorites); }, [favorites]);

  // Back: dialog → closes, player → list, any section but the first → the first, in the first → leave the app to the TV.
  useEffect(() => installDpad(() => {
    if (deleting) { setDeleting(null); return true; }
    if (resetting) { setResetting(false); return true; }
    if (qr) { setQr(null); return true; }
    if (deletingProfile) { setDeletingProfile(null); return true; }
    if (picking) { setPicking(false); return true; }
    if (sheet) { if (sheetPage) setSheetPage(null); else setSheet(false); return true; }
    if (playing) { exitPlayer(); return true; }
    if (section !== "live") { setSection("live"); return true; }
    return false;
  }), [deleting, resetting, qr, deletingProfile, picking, sheet, sheetPage, playing, section]);

  const open = (c: Channel, list: readonly Channel[]) => setPlaying({ list, index: Math.max(0, list.findIndex((x) => x.id === c.id)) });
  const exitPlayer = () => {
    setLeaving(true);
    setTimeout(() => { setPlaying(null); setLeaving(false); }, 200); // the player fades out before it is gone
  };
  const recents = useMemo(() => recentChannels(pl.channels, history), [pl.channels, history]);
  const watching = playing ? playing.list[playing.index] : null;
  // A channel counts as watched once it has been on for a moment: zapping past it does not fill the history.
  useEffect(() => {
    if (!watching) return;
    const id = setTimeout(() => setHistory((h) => { const next = pushRecent(h, channelKey(watching)); saveHistory(next); return next; }), 2500);
    return () => clearTimeout(id);
  }, [watching?.id]);
  const ui = useMemo(() => ({ rowH: settings.rowSize, logos: settings.showLogos, numbers: settings.showNumbers, program: settings.showProgram }),
    [settings.rowSize, settings.showLogos, settings.showNumbers, settings.showProgram]);
  const finishWizard = (r: WizardResult) => {
    setSettings((cur) => ({ ...cur, ...r.settings }));
    if (!book) {
      const b = firstBook(r.guest ? t("guestName") : (r.name ?? ""), r.guest);
      saveBook(b);
      setBook(b);
    }
    if (r.playlist.kind === "url") pl.add(r.playlist.url);
    else if (r.playlist.kind === "demo") pl.addDemo();
    setRedo(false);
  };
  const startBook = (name: string, guest: boolean) => { const b = firstBook(name, guest); saveBook(b); setBook(b); };
  const switchTo = (id: string) => {
    if (!book) return;
    saveBook(switchProfile(book, id));
    location.reload(); // another profile = another set of playlists, favourites and guide: start clean
  };
  const addOne = (name: string) => { if (!book) return; const b = addProfile(book, name); saveBook(b); setBook(b); };
  const doomedProfile = book && deletingProfile ? book.profiles.find((x) => x.id === deletingProfile) : undefined;
  const me = book?.profiles.find((x) => x.id === book.activeId);
  const greeting = !me ? "" : me.guest ? t("greetingGuest") : t("greeting", { name: me.name });
  /** The rail: another place opens; the one already open sends the focus into its content (so the icon always does something). */
  const goTo = (id: Section) => {
    if (id !== section) { setSection(id); return; }
    const first = document.querySelector<HTMLElement>(".content [data-focus]");
    first?.focus();
  };
  const toggleFavorite = (c: Channel) => setFavorites((f) => toggle(f, channelKey(c)));
  const doomed = deleting ? pl.store.list.find((p) => p.id === deleting) : undefined;

  if (playing) {
    const current = playing.list[playing.index] as Channel;
    return (
      <UiContext.Provider value={ui}>
      <GuideContext.Provider value={guideValue}>
      <PlayerView
        channels={playing.list} catalog={pl.channels} index={playing.index} favorites={favorites} recents={recents} closing={leaving}
        onPick={(c, list) => setPlaying({ list, index: Math.max(0, list.findIndex((x) => x.id === c.id)) })}
        onStep={(d) => setPlaying((cur) => (cur ? { list: cur.list, index: (cur.index + d + cur.list.length) % cur.list.length } : cur))}
        onFav={toggleFavorite} onExit={exitPlayer}
        settings={settings} onChangeSettings={setSettings}
      />
      </GuideContext.Provider>
      </UiContext.Provider>
    );
  }

  return (
    <UiContext.Provider value={ui}>
    <GuideContext.Provider value={guideValue}>
      <nav
        class={`rail${railOpen ? " open" : ""}`} data-collapsed={railOpen ? undefined : ""}
        onFocusIn={() => setRailOpen(true)}
        onFocusOut={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setRailOpen(false); }}
      >
        <div class="rail-mid">
          {NAV.map(([id, icon, label]) => (
            <button class="rail-item" key={id} data-focus={`nav-${id}`} data-label={t(label)} aria-label={t(label)} aria-current={section === id && !sheet} onClick={() => goTo(id)}>
              <Icon name={icon} />
            </button>
          ))}
          <button class="rail-item" data-focus="nav-settings" data-label={t("navSettings")} aria-label={t("navSettings")} aria-current={sheet} onClick={() => { setSheetPage(null); setSheet(true); }}>
            <Icon name="settings" />
          </button>
        </div>
      </nav>
      <main class="content">
        {section === "live" ? (
          <LiveView
            channels={pl.channels} favorites={favorites} status={pl.status} settings={settings}
            onOpen={open} onFav={toggleFavorite}
            onAddPlaylist={() => { setSheetPage("playlists"); setSheet(true); }} onDemo={pl.addDemo}
            greeting={greeting} playlistName={pl.active?.name ?? null} onPickPlaylist={() => setPicking(true)}
            recents={recents} paused={false}
          />
        ) : null}
        {section === "guide" ? <GuideView channels={pl.channels} favorites={favorites} status={guide.status} onRefresh={() => void guide.sync()} onOpen={open} /> : null}
        {section === "sport" ? <SportView channels={pl.channels} favorites={favorites} onOpen={open} onFav={toggleFavorite} /> : null}
        {section === "search" ? <SearchView channels={pl.channels} favorites={favorites} onOpen={open} onFav={toggleFavorite} /> : null}
      </main>
      <Presence show={sheet}>
        {(out) => (
          <SettingsSheet
            show={!out} page={sheetPage} onPage={setSheetPage} onClose={() => setSheet(false)}
            settings={settings} onChange={setSettings} store={pl.store} status={pl.status}
            onAddPlaylist={pl.add} onSelectPlaylist={pl.select} onAskDeletePlaylist={setDeleting}
            onAskReset={() => setResetting(true)}
            guide={{ data: guide.data, status: guide.status, outcomes: guide.outcomes, onRefresh: () => void guide.sync(), onClear: guide.clear }}
            channelCount={pl.channels.length} active={pl.active} headerGuides={pl.headerGuides}
            book={book ?? firstBook("", true)} onSwitchProfile={switchTo} onAddProfile={addOne} onAskDeleteProfile={setDeletingProfile}
            onQr={(name, address) => setQr({ name, address })}
            onRedoWizard={() => { setSheet(false); setRedo(true); }}
          />
        )}
      </Presence>
      <Presence show={picking}>
        {(out) => (
          <PlaylistPicker store={pl.store} onSelect={pl.select} onClose={() => setPicking(false)} closing={out}
            onManage={() => { setPicking(false); setSheetPage("playlists"); setSheet(true); }} />
        )}
      </Presence>
      {qr ? <QrDialog name={qr.name} address={qr.address} onClose={() => setQr(null)} /> : null}
      {doomedProfile ? (
        <Confirm
          title={t("profileDeleteTitle")} body={doomedProfile.name} confirm={t("playlistDelete")}
          onCancel={() => setDeletingProfile(null)}
          onConfirm={() => {
            if (book) { purgeProfile(doomedProfile.id); const b = removeProfile(book, doomedProfile.id); saveBook(b); setBook(b); }
            setDeletingProfile(null);
          }}
        />
      ) : null}
      {book === null || redo ? (
        <Wizard settings={settings} hasProfile={book !== null} onPreview={setSettings} onFinish={finishWizard} onCancel={redo ? () => setRedo(false) : undefined} />
      ) : null}
      {resetting ? (
        <Confirm
          title={t("setResetTitle")} body={t("setResetHint")} confirm={t("setResetDo")}
          onCancel={() => setResetting(false)}
          onConfirm={() => { setSettings(DEFAULTS); setResetting(false); }}
        />
      ) : null}
      {doomed ? (
        <Confirm
          title={t("confirmDeleteTitle")} body={doomed.name} confirm={t("playlistDelete")}
          onCancel={() => setDeleting(null)}
          onConfirm={() => { pl.remove(doomed.id); setDeleting(null); }}
        />
      ) : null}
    </GuideContext.Provider>
    </UiContext.Provider>
  );
}
