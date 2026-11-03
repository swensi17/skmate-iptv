import { Ticks } from "./views/Spinner";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { archiveUrl, canRemind, clampTiles, nextEpisode, openGrid, type Grid, type Episode, type Movie, type Show, hashPin, validPin, verifyPin, visibleTo, type Channel, type Reminder } from "@skmate/core";
import type { Programme } from "@skmate/epg";
import { Icon, installDpad, Presence, watchFrames, type IconName } from "@skmate/ui";
import { applyLanguage, loadLanguage, t, type Key } from "./i18n";
import skLogo from "./assets/skmate-sk.png";
import { channelKey, loadFavorites, saveFavorites, toggle } from "./state/favorites";
import { applyAll, DEFAULTS, load, save, type Settings } from "./state/settings";
import { GuideContext } from "./state/GuideContext";
import { loadHistory, pushRecent, recentChannels, saveHistory } from "./state/history";
import { UiContext } from "./state/UiContext";
import { useGuide } from "./state/useGuide";
import { useUpdates } from "./state/useUpdates";
import { useReminders } from "./state/useReminders";
import { ProgrammeDialog, ReminderNote, ReminderPrompt } from "./views/Reminders";
import { desktop, useFullScreen, useRecordingEnd } from "./state/desktop";
import { addProfile, firstBook, loadBook, purgeProfile, removeProfile, saveBook, setKids, setPinHash, switchProfile, type ProfileBook } from "./state/scope";
import { usePlaylists } from "./state/usePlaylists";
import { Confirm } from "./views/Confirm";
import { PinDialog } from "./views/PinDialog";
import { UpdateDialog } from "./views/UpdateDialog";
import { QrDialog } from "./views/QrDialog";
import { PlaylistPicker } from "./views/PlaylistPicker";
import { Wizard, type WizardResult } from "./views/Wizard";
import { GuideView } from "./views/GuideView";
import { LiveView } from "./views/LiveView";
import { PlayerView } from "./views/PlayerView";
import { SearchView } from "./views/SearchView";
import { SettingsSheet, type Page } from "./views/SettingsSheet";
import { SportView } from "./views/SportView";
import { MultiviewScreen } from "./views/MultiviewScreen";
import { maxConnections } from "./state/connections";
import { VodDetails, episodeLabel } from "./views/VodDetails";
import { VodPlayer } from "./views/VodPlayer";
import { VodView } from "./views/VodView";
import { vodSourceOf } from "./state/library";
import { continueWatching, loadProgress, progressKey, saveProgress, type Progress } from "./state/progress";

type Section = "live" | "movies" | "series" | "guide" | "sport" | "search";
/** The middle of the rail: the places you go; Settings sits apart at the bottom and opens as a sheet. */
const NAV: Array<[Section, IconName, Key]> = [
  ["live", "live_tv", "navLive"],
  ["movies", "movies", "navMovies"],
  ["series", "series", "navSeries"],
  ["guide", "epg", "navGuide"],
  ["sport", "sports", "navSport"],
  ["search", "search", "navSearch"],
];

/** sessionStorage: the profile just opened with its PIN, so the restart that follows does not ask again. */
const UNLOCKED_KEY = "skmate.unlocked";

export function App() {
  const [section, setSection] = useState<Section>("live");
  // `archive`: a past programme played from the provider's recording instead of the live stream.
  const [playing, setPlaying] = useState<{ list: readonly Channel[]; index: number; archive?: { programme: Programme; url: string } } | null>(null);
  // A film or an episode full screen, and the card it was opened from.
  const [vodPlay, setVodPlay] = useState<{
    key: string; title: string; subtitle?: string; url: string; headers?: Record<string, string>; startMs: number;
    meta: Omit<Progress, "positionMs" | "durationMs" | "at">; next?: { label: string; play: () => void } | null;
  } | null>(null);
  // The multiview: several live channels on one screen; the provider's connection limit comes with it.
  const [multiview, setMultiview] = useState<{ grid: Grid; limit: number } | null>(null);
  const openMultiview = (c: Channel) => {
    const max = clampTiles(settings.multiviewTiles);
    setPlaying(null);
    setMultiview({ grid: openGrid(c, max), limit: 0 });
    void maxConnections(pl.active?.url ?? "").then((limit) => setMultiview((cur) => (cur ? { ...cur, limit } : cur)));
  };
  const [details, setDetails] = useState<{ item: Movie | Show; kind: "movie" | "series" } | null>(null);
  const [settings, setSettings] = useState<Settings>(load);
  const [throttled, setThrottled] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [book, setBook] = useState<ProfileBook | null>(loadBook);
  const [deletingProfile, setDeletingProfile] = useState<string | null>(null);
  // A PIN asked for something (switching to a locked profile, changing the lock); null when none is asked.
  const [pinAsk, setPinAsk] = useState<{ title: string; hint?: string; check: (pin: string) => boolean; onDone: (pin: string) => void } | null>(null);
  // A locked profile opens with its PIN, as on Android; a switch that was just unlocked is not asked twice.
  const [unlocked, setUnlocked] = useState(() => {
    const b = loadBook();
    const active = b?.profiles.find((p) => p.id === b.activeId);
    let just = false;
    try { just = sessionStorage.getItem(UNLOCKED_KEY) === b?.activeId; sessionStorage.removeItem(UNLOCKED_KEY); } catch { /* asked again */ }
    return !active?.pinHash || just;
  });
  const [picking, setPicking] = useState(false);
  // A programme still to come, picked in the guide or the search: watch its channel or set a reminder.
  const [upcoming, setUpcoming] = useState<{ channel: Channel; programme: Programme; list: readonly Channel[] } | null>(null);
  const [note, setNote] = useState<Reminder | null>(null);
  const [qr, setQr] = useState<{ name: string; address: string } | null>(null);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [leaving, setLeaving] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [redo, setRedo] = useState(false);
  const [sheet, setSheet] = useState(false);
  const full = useFullScreen();
  // Updates wait for the picture to end: nothing interrupts a channel.
  const update = useUpdates(settings.autoUpdate, playing !== null);
  const [sheetPage, setSheetPage] = useState<Page | null>(null);
  const pl = usePlaylists();
  const rem = useReminders();
  // The reminder whose moment has come first; asked about only in the "ask" mode, and never over the lock screen.
  const firstDue = rem.due[0] ?? null;
  const prompt = unlocked && settings.reminderMode === "ask" ? firstDue : null;
  const guide = useGuide(pl.channels, pl.active, pl.headerGuides, settings);
  const guideValue = useMemo(() => ({ data: guide.data, now: guide.now }), [guide.data, guide.now]);
  applyLanguage(settings.language); // before anything is drawn: the whole screen speaks one language
  // Another language chosen: its table is fetched, then the screen is drawn again in it.
  const [, setLangReady] = useState(0);
  useEffect(() => { void loadLanguage(settings.language).then(() => setLangReady((n) => n + 1)); }, [settings.language]);

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
    if (!unlocked) return true; // the lock screen stays until a PIN or another profile is chosen
    if (prompt) { rem.remove(prompt); return true; }
    if (upcoming) { setUpcoming(null); return true; }
    if (pinAsk) { setPinAsk(null); return true; }
    if (deleting) { setDeleting(null); return true; }
    if (resetting) { setResetting(false); return true; }
    if (qr) { setQr(null); return true; }
    if (deletingProfile) { setDeletingProfile(null); return true; }
    if (picking) { setPicking(false); return true; }
    if (multiview) return true; // the multiview takes Back itself
    if (details) { setDetails(null); return true; }
    if (sheet) { if (sheetPage) setSheetPage(null); else setSheet(false); return true; }
    if (playing) { exitPlayer(); return true; }
    if (section !== "live") { setSection("live"); return true; }
    return false;
  }), [unlocked, prompt, upcoming, pinAsk, deleting, resetting, qr, deletingProfile, picking, details, multiview, sheet, sheetPage, playing, section]);

  const openHere = (c: Channel, list: readonly Channel[]) => setPlaying({ list, index: Math.max(0, list.findIndex((x) => x.id === c.id)) });
  // A note at the top that goes by itself: a recording saved, an external player that did not start.
  const [flash, setFlash] = useState<{ icon: IconName; text: string } | null>(null);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(null), 5000); return () => clearTimeout(id); }, [flash]);
  // A playlist that has just loaded after being added from the settings: say so, and take the viewer to the channels.
  const wasLoading = useRef(false);
  useEffect(() => {
    const loading = pl.status.kind === "loading";
    if (wasLoading.current && !loading) {
      if (pl.status.kind === "idle" && pl.channels.length > 0 && sheet && sheetPage === "playlists") {
        setFlash({ icon: "playlist", text: `${pl.active?.name ?? ""} · ${t("channelsCount", { n: pl.channels.length })}` });
        setSheet(false);
      }
    }
    wasLoading.current = loading;
  }, [pl.status.kind]);
  const recEnd = useRecordingEnd();
  useEffect(() => {
    const e = recEnd.end;
    if (!e) return;
    const name = e.path ? e.path.split(/[\\/]/).pop() ?? "" : "";
    setFlash(e.state === "done" && e.bytes > 0 ? { icon: "folder", text: t("recSaved", { name }) } : { icon: "warning", text: t("recFailed") });
    recEnd.clear();
  }, [recEnd.end]);
  // The Windows app with an external player chosen: the channel goes to VLC or mpv, as Android's external player;
  // if that player does not start, the channel plays here after all.
  const open = (c: Channel, list: readonly Channel[]) => {
    const app = desktop();
    if (!app || settings.externalPlayer === "off") { openHere(c, list); return; }
    const player = settings.externalPlayer;
    app.openInPlayer(player, c.url, c.name, c.headers ?? {}).then((ok) => {
      if (ok) setHistory((h) => { const next = pushRecent(h, channelKey(c)); saveHistory(next); return next; });
      else { setFlash({ icon: "warning", text: t("externalFailed", { player: player === "vlc" ? "VLC" : "mpv" }) }); openHere(c, list); }
    }, () => openHere(c, list));
  };
  /** A past programme: its recording when the channel keeps one, else the channel live. */
  const openArchive = (c: Channel, p: Programme, list: readonly Channel[]) => {
    const url = archiveUrl(c, p.start, p.stop);
    if (url === null) { open(c, list); return; }
    setPlaying({ list, index: Math.max(0, list.findIndex((x) => x.id === c.id)), archive: { programme: p, url } });
  };
  const exitPlayer = () => {
    setLeaving(true);
    setTimeout(() => { setPlaying(null); setLeaving(false); }, 200); // the player fades out before it is gone
  };
  const me = book?.profiles.find((x) => x.id === book.activeId);
  // A kids profile sees no adult category anywhere: one filter here, every screen gets the same list.
  // Films and series are not channels: they leave Live TV for their own sections, as on Android.
  const channels = useMemo(() => visibleTo(pl.channels.filter((c) => !c.media), !!me?.kids) as Channel[], [pl.channels, me?.kids]);
  const vod = useMemo(() => (pl.active ? vodSourceOf(pl.active.url, pl.channels, !!me?.kids) : null), [pl.active?.url, pl.channels, me?.kids]);
  const playlistId = pl.active?.id ?? "";
  const [progressTick, setProgressTick] = useState(0);
  const progressOf = (kind: "movie" | "series") => (id: string): Progress | undefined => loadProgress()[progressKey(playlistId, kind, id)];
  const continueRow = useMemo(() => continueWatching(playlistId), [playlistId, progressTick]);
  const playMovie = (m: Movie, startMs: number) => {
    setDetails(null);
    setVodPlay({
      key: progressKey(playlistId, "movie", m.id), title: m.name, url: m.url, headers: m.headers, startMs,
      meta: { kind: "movie", itemId: m.id, name: m.name, poster: m.poster, item: m },
    });
  };
  const playEpisode = (show: Show, episodes: Episode[], e: Episode, startMs: number) => {
    setDetails(null);
    const n = nextEpisode(episodes, e.id);
    setVodPlay({
      key: progressKey(playlistId, "series", e.id), title: show.name, subtitle: `${episodeLabel(e)}${e.title ? `  ${e.title}` : ""}`, url: e.url,
      headers: e.headers, startMs, meta: { kind: "series", itemId: show.id, name: show.name, poster: show.poster, item: show, episodeId: e.id, episodeLabel: episodeLabel(e) },
      next: n ? { label: `${episodeLabel(n)}${n.title ? `  ${n.title}` : ""}`, play: () => playEpisode(show, episodes, n, 0) } : null,
    });
  };
  const recents = useMemo(() => recentChannels(channels, history), [channels, history]);
  // Reminders, as on Android: the guide's "Remind me" sets one; when its moment comes the app asks to switch,
  // switches, or only says so (Settings, Guide). Watch or Close both end it.
  const reminded = (c: Channel, p: Programme) => rem.has(channelKey(c), p.start);
  const openUpcoming = (c: Channel, p: Programme, list: readonly Channel[]) => setUpcoming({ channel: c, programme: p, list });
  const watchReminder = (r: Reminder) => {
    rem.remove(r);
    const c = channels.find((x) => channelKey(x) === r.channel);
    if (c) setPlaying({ list: channels, index: channels.indexOf(c) });
  };
  useEffect(() => {
    if (!firstDue || !unlocked) return;
    if (settings.reminderMode === "switch") watchReminder(firstDue);
    else if (settings.reminderMode === "notify") { rem.remove(firstDue); setNote(firstDue); }
  }, [firstDue?.channel, firstDue?.start, settings.reminderMode, unlocked]);
  useEffect(() => { if (!note) return; const id = setTimeout(() => setNote(null), 8000); return () => clearTimeout(id); }, [note]);

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
    else if (r.playlist.kind === "file") void pl.addFile(r.playlist.name, r.playlist.text);
    else if (r.playlist.kind === "demo") pl.addDemo();
    setRedo(false);
  };
  const startBook = (name: string, guest: boolean) => { const b = firstBook(name, guest); saveBook(b); setBook(b); };
  const goToProfile = (id: string, opened: boolean) => {
    if (!book) return;
    saveBook(switchProfile(book, id));
    if (opened) { try { sessionStorage.setItem(UNLOCKED_KEY, id); } catch { /* the PIN is asked once more */ } }
    location.reload(); // another profile = another set of playlists, favourites and guide: start clean
  };
  const switchTo = (id: string) => {
    const target = book?.profiles.find((p) => p.id === id);
    if (!target) return;
    if (!target.pinHash) { goToProfile(id, false); return; }
    setPinAsk({ title: t("pinEnterFor", { name: target.name }), check: (pin) => verifyPin(pin, target.pinHash), onDone: () => goToProfile(id, true) });
  };
  const updateBook = (b: ProfileBook) => { saveBook(b); setBook(b); };
  /** The active profile's lock: a new PIN typed twice; removing it, or making it no longer a kids profile, takes the PIN. */
  const askNewPin = () => {
    if (!book) return;
    setPinAsk({ title: t("pinNew"), check: validPin, onDone: (first) => setPinAsk({
      title: t("pinRepeat"), check: (again) => again === first,
      onDone: () => { updateBook(setPinHash(book, book.activeId, hashPin(first))); setPinAsk(null); },
    }) });
  };
  const withOwnPin = (then: () => void) => {
    const own = book?.profiles.find((p) => p.id === book.activeId);
    if (!own?.pinHash) { then(); return; }
    setPinAsk({ title: t("pinEnterFor", { name: own.name }), check: (pin) => verifyPin(pin, own.pinHash), onDone: () => { setPinAsk(null); then(); } });
  };
  const removePin = () => withOwnPin(() => { if (book) updateBook(setPinHash(book, book.activeId, null)); });
  const toggleKids = () => {
    const own = book?.profiles.find((p) => p.id === book.activeId);
    if (!book || !own) return;
    if (!own.kids) updateBook(setKids(book, book.activeId, true));
    else withOwnPin(() => updateBook(setKids(book, book.activeId, false)));
  };
  const askDeleteProfile = (id: string) => {
    const target = book?.profiles.find((p) => p.id === id);
    if (!target?.pinHash) { setDeletingProfile(id); return; }
    setPinAsk({ title: t("pinEnterFor", { name: target.name }), check: (pin) => verifyPin(pin, target.pinHash), onDone: () => { setPinAsk(null); setDeletingProfile(id); } });
  };
  const addOne = (name: string) => { if (!book) return; const b = addProfile(book, name); saveBook(b); setBook(b); };
  const doomedProfile = book && deletingProfile ? book.profiles.find((x) => x.id === deletingProfile) : undefined;
  const greeting = !me ? "" : me.guest ? t("greetingGuest") : t("greeting", { name: me.name });
  /** The rail: another place opens; the one already open sends the focus into its content (so the icon always does something). */
  const goTo = (id: Section) => {
    if (id !== section) { setSection(id); return; }
    const first = document.querySelector<HTMLElement>(".content [data-focus]");
    first?.focus();
  };
  const toggleFavorite = (c: Channel) => setFavorites((f) => toggle(f, channelKey(c)));
  const doomed = deleting ? pl.store.list.find((p) => p.id === deleting) : undefined;

  // The lock screen of a profile with a PIN: nothing of it shows before the PIN, another profile can be chosen.
  if (book && !unlocked && me?.pinHash) {
    const others = book.profiles.filter((x) => x.id !== me.id);
    return (
      <PinDialog
        title={t("pinEnterFor", { name: me.guest ? t("guestName") : me.name })}
        check={(pin) => verifyPin(pin, me.pinHash)} onDone={() => setUnlocked(true)}
        extra={others.map((o) => (
          <button class="btn" key={o.id} data-focus={`gate-${o.id}`} onClick={() => goToProfile(o.id, false)}>
            {t("pinOtherProfile")}: {o.guest ? t("guestName") : o.name}
          </button>
        ))}
      />
    );
  }

  if (multiview) {
    return (
      <UiContext.Provider value={ui}>
        <MultiviewScreen
          initial={multiview.grid} catalog={channels} favorites={favorites} settings={settings}
          maxTiles={clampTiles(settings.multiviewTiles)} maxConnections={multiview.limit}
          onFullscreen={(c) => { setMultiview(null); open(c, channels); }}
          onExit={() => setMultiview(null)}
        />
      </UiContext.Provider>
    );
  }

  if (vodPlay) {
    return (
      <UiContext.Provider value={ui}>
        <VodPlayer
          key={vodPlay.url} title={vodPlay.title} subtitle={vodPlay.subtitle} url={vodPlay.url} headers={vodPlay.headers} startMs={vodPlay.startMs}
          settings={settings} next={vodPlay.next}
          onProgress={(positionMs, durationMs) => saveProgress(vodPlay.key, { ...vodPlay.meta, positionMs, durationMs, at: Date.now() })}
          onExit={() => { setVodPlay(null); setProgressTick((n) => n + 1); }}
        />
      </UiContext.Provider>
    );
  }

  if (playing) {
    const current = playing.list[playing.index] as Channel;
    return (
      <UiContext.Provider value={ui}>
      <GuideContext.Provider value={guideValue}>
      <PlayerView
        channels={playing.list} catalog={channels} index={playing.index} favorites={favorites} recents={recents} closing={leaving}
        onPick={(c, list) => setPlaying({ list, index: Math.max(0, list.findIndex((x) => x.id === c.id)) })}
        onStep={(d) => setPlaying((cur) => (cur ? { list: cur.list, index: (cur.index + d + cur.list.length) % cur.list.length } : cur))}
        onFav={toggleFavorite} onExit={exitPlayer}
        onMultiview={openMultiview}
        archive={playing.archive ?? null} onLive={() => setPlaying((cur) => (cur ? { list: cur.list, index: cur.index } : cur))}
        onArchive={(programme, url) => setPlaying((cur) => (cur ? { list: cur.list, index: cur.index, archive: { programme, url } } : cur))}
        onGo={(to) => { setSection(to); exitPlayer(); }}
        settings={settings} onChangeSettings={setSettings}
        suspended={prompt !== null}
      />
      {prompt ? <ReminderPrompt reminder={prompt} now={Date.now()} onWatch={() => watchReminder(prompt)} onClose={() => rem.remove(prompt)} /> : null}
      {note ? <ReminderNote reminder={note} now={Date.now()} /> : null}
      {flash ? <div class="toast" role="status"><Icon name={flash.icon} size={28} /><span>{flash.text}</span></div> : null}
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
        <img class="rail-logo" src={skLogo} alt="SkMate" />
        <div class="rail-mid">
          {NAV.map(([id, icon, label]) => (
            <button class="rail-item" key={id} data-focus={`nav-${id}`} data-label={t(label)} aria-label={t(label)} aria-current={section === id && !sheet} onClick={() => goTo(id)}>
              <Icon name={icon} />
            </button>
          ))}
          <button class="rail-item" data-focus="nav-settings" data-label={t("navSettings")} aria-label={t("navSettings")} aria-current={sheet} onClick={() => { setSheetPage(null); setSheet(true); }}>
            <Icon name="settings" />
          </button>
          {full ? (
            <button class="rail-item" data-focus="nav-full" data-label={t(full.on ? "fullScreenExit" : "fullScreen")} aria-label={t(full.on ? "fullScreenExit" : "fullScreen")} onClick={full.toggle}>
              <Icon name={full.on ? "fullscreen_exit" : "fullscreen"} />
            </button>
          ) : null}
        </div>
      </nav>
      <main class="content">
        {section === "live" ? (
          <LiveView
            channels={channels} favorites={favorites} status={pl.status} settings={settings}
            onOpen={open} onFav={toggleFavorite}
            onAddPlaylist={() => { setSheetPage("playlists"); setSheet(true); }} onDemo={pl.addDemo}
            greeting={greeting} playlistName={pl.active?.name ?? null} onPickPlaylist={() => setPicking(true)}
            recents={recents} paused={false}
          />
        ) : null}
        {section === "guide" ? <GuideView channels={channels} favorites={favorites} status={guide.status} onRefresh={() => void guide.sync()} onOpen={open} onArchive={openArchive} onUpcoming={openUpcoming} reminded={reminded} /> : null}
        {section === "sport" ? <SportView channels={channels} favorites={favorites} onOpen={open} onFav={toggleFavorite} /> : null}
        {section === "movies" || section === "series" ? (
          <VodView kind={section === "movies" ? "movie" : "series"} source={vod}
            continueRow={continueRow.filter((r) => r.kind === (section === "movies" ? "movie" : "series"))}
            onOpen={(item) => setDetails({ item, kind: section === "movies" ? "movie" : "series" })}
            onContinue={(r) => setDetails({ item: r.item, kind: r.kind })} />
        ) : null}
        {details && vod ? (
          <VodDetails item={details.item} kind={details.kind} source={vod} progressOf={progressOf(details.kind)}
            onPlayMovie={playMovie} onPlayEpisode={playEpisode} onClose={() => setDetails(null)} />
        ) : null}
        {section === "search" ? <SearchView channels={channels} favorites={favorites} onOpen={open} onArchive={openArchive} onUpcoming={openUpcoming} reminded={reminded} onFav={toggleFavorite} /> : null}
      </main>
      <Presence show={sheet}>
        {(out) => (
          <SettingsSheet
            show={!out} page={sheetPage} onPage={setSheetPage} onClose={() => setSheet(false)}
            settings={settings} onChange={setSettings} store={pl.store} status={pl.status}
            onAddPlaylist={pl.add} onAddPlaylistFile={pl.addFile} onSelectPlaylist={pl.select} onEditPlaylist={pl.update} onAskDeletePlaylist={setDeleting}
            onAskReset={() => setResetting(true)}
            guide={{ data: guide.data, status: guide.status, outcomes: guide.outcomes, onRefresh: () => void guide.sync(), onClear: guide.clear }}
            channelCount={pl.channels.length} active={pl.active} headerGuides={pl.headerGuides}
            book={book ?? firstBook("", true)} onSwitchProfile={switchTo} onAddProfile={addOne} onAskDeleteProfile={askDeleteProfile}
            onSetPin={askNewPin} onRemovePin={removePin} onToggleKids={toggleKids}
            onQr={(name, address) => setQr({ name, address })}
            update={update} onRedoWizard={() => { setSheet(false); setRedo(true); }}
          />
        )}
      </Presence>
      <Presence show={picking}>
        {(out) => (
          <PlaylistPicker store={pl.store} onSelect={pl.select} onClose={() => setPicking(false)} closing={out}
            onManage={() => { setPicking(false); setSheetPage("playlists"); setSheet(true); }} />
        )}
      </Presence>
      {update.dialog ? (
        <UpdateDialog release={update.dialog} installing={update.state.kind === "installing"} onInstall={update.install} onLater={update.later} />
      ) : null}
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
      {upcoming ? (
        <ProgrammeDialog
          channel={upcoming.channel} programme={upcoming.programme} reminded={reminded(upcoming.channel, upcoming.programme)}
          onWatch={() => { open(upcoming.channel, upcoming.list); setUpcoming(null); }}
          onRemind={() => {
            const { channel: c, programme: p } = upcoming;
            if (canRemind(p.start, Date.now())) rem.add({ channel: channelKey(c), channelName: c.name, title: p.title, start: p.start, stop: p.stop, lead: settings.reminderLead });
            setUpcoming(null);
          }}
          onCancelRemind={() => { rem.remove({ channel: channelKey(upcoming.channel), start: upcoming.programme.start }); setUpcoming(null); }}
          onClose={() => setUpcoming(null)}
        />
      ) : null}
      {prompt ? <ReminderPrompt reminder={prompt} now={Date.now()} onWatch={() => watchReminder(prompt)} onClose={() => rem.remove(prompt)} /> : null}
      {note ? <ReminderNote reminder={note} now={Date.now()} /> : null}
      {flash ? <div class="toast" role="status"><Icon name={flash.icon} size={28} /><span>{flash.text}</span></div> : null}
      {pl.status.kind === "loading" ? (
        <div class="loading" role="status" aria-label={t("playlistLoading")}>
          <Ticks />
        </div>
      ) : null}
      {/* A fresh dialog for every question: the digits of "New PIN" must not carry over into "Repeat the PIN". */}
      {pinAsk ? <PinDialog key={pinAsk.title} title={pinAsk.title} hint={pinAsk.hint} check={pinAsk.check} onDone={pinAsk.onDone} onCancel={() => setPinAsk(null)} /> : null}
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
