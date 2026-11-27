import { Ticks } from "./views/Spinner";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { archiveUrl, canRemind, clampTiles, nextEpisode, openGrid, type Grid, type Episode, type Movie, type Show, hashPin, validPin, verifyPin, visibleTo, type Channel, type Reminder } from "@skmate/core";
import type { Programme } from "@skmate/epg";
import { Icon, installDpad, Presence, watchFrames, type IconName } from "@skmate/ui";
import { applyLanguage, loadLanguage, t, type Key } from "./i18n";
import skLogo from "./assets/skmate-sk.png";
import { channelKey, favKey, loadFavorites, migrateFavorites, saveFavorites, toggle } from "./state/favorites";
import { applyAll, DEFAULTS, liveSettingsFor, load, save, type Settings } from "./state/settings";
import { GuideContext } from "./state/GuideContext";
import { loadHistory, pushRecent, recentChannels, saveHistory } from "./state/history";
import { UiContext } from "./state/UiContext";
import { useGuide } from "./state/useGuide";
import { useUpdates } from "./state/useUpdates";
import { useReminders } from "./state/useReminders";
import { ProgrammeDialog, ReminderNote, ReminderPrompt } from "./views/Reminders";
import { desktop, useFullScreen, useRecordingEnd } from "./state/desktop";
import { addProfile, firstBook, loadBook, purgeProfile, removeProfile, renameProfile, saveBook, setKids, setPinHash, switchProfile, type ProfileBook } from "./state/scope";
import { usePlaylists } from "./state/usePlaylists";
import { Confirm } from "./views/Confirm";
import { PinDialog } from "./views/PinDialog";
import { UpdateDialog } from "./views/UpdateDialog";
import { QrDialog } from "./views/QrDialog";
import { PlaylistPicker } from "./views/PlaylistPicker";
import { Terms, Wizard, withWizardProfile, type WizardResult } from "./views/Wizard";
import { GuideView } from "./views/GuideView";
import { LiveView, primeLive, type LiveEntry } from "./views/LiveView";
import { StageIcon, type StageIconName } from "./views/GroupIcon";
import { HomeStatus } from "./views/HomeStatus";
import { detectPlatform, exitApp } from "./platform";
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
/**
 * The side menu (Android StageRail.kt, TV-box look): Home (the channels), Sport, Guide, Search, then the gear
 * (Settings, as a sheet). Films, series and downloads are not in the TV-box menu (StageRail.kt TvBoxHiddenSections).
 */
const NAV: Array<[Section, StageIconName, Key]> = [
  ["live", "home", "homeNavHome"],
  ["sport", "sports", "homeNavSport"],
  ["guide", "epg", "homeNavGuide"],
  ["search", "search", "homeNavSearch"],
];
/** A second Back on the channels screen within this leaves the app (OwnTVShell.kt ExitBackWindowMs). */
const EXIT_BACK_MS = 2000;

// Leaving the app on the second Back is platform/index.ts exitApp: Tizen exits, webOS calls platformBack (a store rule).

/** sessionStorage: the profile just opened with its PIN, so the restart that follows does not ask again. */
const UNLOCKED_KEY = "skmate.unlocked";
/** The PIN that opens adult categories on a profile without one of its own (Android AdultLock.DEFAULT_PIN). */
const ADULT_DEFAULT_PIN = "0000";

export function App() {
  // settings functions (Android): «Прямой эфир открывается в виде» Телегид = Live TV is drawn as the guide
  // (OwnTVShell.kt liveMode EpgScreen); [guideAsLive] tells that guide from the menu's own Guide.
  const [section, setSection] = useState<Section>(() => (load().liveOpensIn === "guide" && load().startup !== "favorites" ? "guide" : "live"));
  const [guideAsLive, setGuideAsLive] = useState(() => section === "guide");
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
  // settings functions (Android): where the channels screen starts (Запуск приложения › Избранное; Просмотр и списки
  // › the last category and channel), set before it is first drawn.
  useState(() => {
    primeLive({ favorites: settings.startup === "favorites", rememberGroup: !!settings.browseLastCat[0], rememberItem: !!settings.browseLastItem[0] });
    return 0;
  });
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
  // The channels screen's way in from the side menu (its open categories, else the channel row): see LiveView.
  const liveEntry = useRef<LiveEntry | null>(null);
  // "Press Back again to exit" (OwnTVShell.kt): when the first Back on the channels screen was pressed.
  const [backAt, setBackAt] = useState(0);
  useEffect(() => { if (!backAt) return; const id = setTimeout(() => setBackAt(0), EXIT_BACK_MS); return () => clearTimeout(id); }, [backAt]);
  const [redo, setRedo] = useState(false);
  const [sheet, setSheet] = useState(false);
  const full = useFullScreen();
  // Updates wait for the picture to end: nothing interrupts a channel.
  const update = useUpdates({ auto: settings.autoUpdate, onStart: settings.updateOnStart, every: settings.updateEvery, window: settings.updateWindow }, playing !== null);
  const [sheetPage, setSheetPage] = useState<Page | null>(null);
  // Where an open settings section came from, so one step back returns there: the menu, the channel screen, or the
  // playlist picker ("Manage playlists"), never somewhere the viewer has not been.
  const [sheetFrom, setSheetFrom] = useState<"menu" | "screen" | "picker">("menu");
  const openSheet = (page: Page | null, from: "menu" | "screen" | "picker") => {
    setSheetFrom(from); setSheetPage(page); setSheet(true);
  };
  const sheetBack = () => {
    if (!sheetPage || sheetFrom === "screen") { setSheet(false); return; }
    if (sheetFrom === "picker") { setSheet(false); setSheetFrom("menu"); setPicking(true); return; }
    setSheetPage(null);
  };
  const pl = usePlaylists(settings.plEvery);
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
      const nav = document.querySelector(".tb-rail");
      const inside = nav?.contains(document.activeElement);
      if (e.clientX < 24) setRailOpen(true);
      else if (e.clientX > 120 && !inside) setRailOpen(false);
    };
    document.addEventListener("mousemove", onMove, { passive: true });
    return () => document.removeEventListener("mousemove", onMove);
  }, []);
  useEffect(() => { saveFavorites(favorites); }, [favorites]);
  // Favourites saved by the tvg-id alone move to the channel they stood for (2.6.2), once the playlist is in.
  useEffect(() => { const next = migrateFavorites(favorites, pl.channels); if (next) setFavorites(next); }, [pl.channels]);
  // ◀ with nothing further left on the screen opens the side menu, however the screen was entered (OwnTVShell.kt: the
  // content box's onKeyEvent calls focusRail when moveFocus(Left) fails). Seen after every other handler had its turn:
  // one that took the key stops it, and the D-pad that found a place moved the focus.
  useEffect(() => {
    let before: Element | null = null;
    const isLeft = (e: KeyboardEvent) => e.key === "ArrowLeft" || e.keyCode === 37;
    const early = (e: KeyboardEvent) => { if (isLeft(e)) before = document.activeElement; };
    const late = (e: KeyboardEvent) => {
      if (!isLeft(e) || document.activeElement !== before || !before) return;
      if (before instanceof HTMLInputElement) return;
      // 2.5.9: ◀ on the settings sheet's own rows opens the menu too, the sheet staying where it is; a dialog or an
      // editor over the sheet keeps ◀ for itself.
      const sheetLayer = before.closest(".st-sheet-layer");
      const onSheet = !!sheetLayer && !!before.closest(".st-sheet-body") && document.querySelectorAll("[data-modal]").length === 1;
      if (!onSheet && (!before.closest(".content") || document.querySelector("[data-modal]"))) return;
      document.querySelector<HTMLElement>(".tb-rail [data-focus]")?.focus(); // the menu puts it on the open place
    };
    window.addEventListener("keydown", early, true);
    window.addEventListener("keydown", late);
    return () => { window.removeEventListener("keydown", early, true); window.removeEventListener("keydown", late); };
  }, []);
  // The stage never scrolls. A sheet that is still rising sits below the screen, and focusing a control in it makes the
  // browser scroll the stage to show it, which would leave the whole screen shifted once the sheet is up.
  useEffect(() => {
    const stage = document.getElementById("app");
    if (!stage) return;
    const pin = () => { if (stage.scrollTop || stage.scrollLeft) { stage.scrollTop = 0; stage.scrollLeft = 0; } };
    stage.addEventListener("scroll", pin, { passive: true });
    return () => stage.removeEventListener("scroll", pin);
  }, []);

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
    if (sheet) { sheetBack(); return true; }
    if (playing) { exitPlayer(); return true; }
    // The side menu: Back closes it, the focus goes back to the screen (OwnTVShell.kt closeMenuToContent).
    if (document.activeElement?.closest(".tb-rail")) { closeMenuToContent(); return true; }
    // Live TV shown as the guide: Back turns it into the list and keeps that (EpgScreen.kt TV-box setLiveView(LIST)).
    if (section === "guide" && guideAsLive) { showLiveAs("list"); return true; }
    // The guide goes back to the menu it was opened from; any other place to the channels.
    if (section === "guide") { focusRail(); return true; }
    if (section !== "live") { setSection("live"); return true; }
    // The channels: a first Back says so, a second within 2 s leaves the app (no question asked).
    if (Date.now() - backAt < EXIT_BACK_MS) return exitApp();
    setBackAt(Date.now());
    return true;
  }), [backAt, unlocked, prompt, upcoming, pinAsk, deleting, resetting, qr, deletingProfile, picking, details, multiview, sheet, sheetPage, sheetFrom, playing, section, guideAsLive]);

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
  // screens 2.5.4 (Android AdultLock): adult groups are closed on every profile while the lock is on, until the profile's
  // PIN (or 0000 on a profile without one) opens them for this run of the app; a kids profile never sees them.
  const [adultOpen, setAdultOpen] = useState(false);
  const adultLocked = settings.adultLock && !adultOpen;
  const hideAdult = !!me?.kids || adultLocked;
  const adultPinOk = (pin: string) => (me?.pinHash ? verifyPin(pin, me.pinHash) : pin === ADULT_DEFAULT_PIN);
  const askAdultPin = (then: () => void) => setPinAsk({
    title: t("sa_live_adult_pin_title"), hint: t("sa_live_adult_open_hint"), check: adultPinOk, onDone: () => { setPinAsk(null); then(); },
  });
  /** Каналы › Ещё › «Показать / Скрыть взрослые каналы» (LiveScreen.kt onAdult). */
  const toggleAdult = () => { if (adultLocked) askAdultPin(() => setAdultOpen(true)); else setAdultOpen(false); };
  /** Мой профиль › «Взрослые каналы по PIN»: switching it off takes the PIN too (ProfileSettingsRows.kt adultLockRow). */
  const toggleAdultLock = () => {
    if (settings.adultLock) askAdultPin(() => setSettings((cur) => ({ ...cur, adultLock: false })));
    else setSettings((cur) => ({ ...cur, adultLock: true }));
  };
  // A kids profile, or any while the adult lock is closed, sees no adult category anywhere: one filter here, every screen
  // gets the same list. Films and series are not channels: they leave Live TV for their own sections, as on Android.
  const channels = useMemo(() => visibleTo(pl.channels.filter((c) => !c.media), hideAdult) as Channel[], [pl.channels, hideAdult]);
  const vod = useMemo(() => (pl.active ? vodSourceOf(pl.active.url, pl.channels, hideAdult) : null), [pl.active?.url, pl.channels, hideAdult]);
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
  // settings functions (Android): the live delay of the playing playlist (Эфир и буфер › per playlist) for the player
  // and the preview. What the player changes goes back into the general settings, never the playlist's own value.
  const liveSettings = useMemo(() => liveSettingsFor(settings, pl.active?.id), [settings, pl.active?.id]);
  const changeFromPlayer = (next: Settings) => setSettings((cur) => (liveSettings === cur || next.buffer !== liveSettings.buffer || next.liveLatency !== liveSettings.liveLatency
    ? next : { ...next, buffer: cur.buffer, liveLatency: cur.liveLatency }));
  // settings functions (Android): Запуск приложения, once, when the app first shows unlocked (OwnTVShell.kt): the last
  // channel or the chosen one full screen; a chosen channel that is gone says so and the channels stay.
  const startupDone = useRef(false);
  useEffect(() => {
    if (startupDone.current || !unlocked || book === null || redo) return;
    const mode = settings.startup;
    if (mode !== "last" && mode !== "channel") { startupDone.current = true; return; }
    if (channels.length === 0) {
      if (pl.status.kind !== "loading" && pl.store.list.length === 0) startupDone.current = true; // nothing to play yet
      return;
    }
    startupDone.current = true;
    if (playing || vodPlay || multiview) return;
    const c = mode === "last" ? recents[0] : channels.find((x) => channelKey(x) === settings.startupChannel);
    if (c) { setPlaying({ list: channels, index: channels.indexOf(c) }); return; }
    if (mode === "channel") setFlash({ icon: "warning", text: t("sa_settings_startup_channel_unavailable") });
  }, [unlocked, book, redo, channels, pl.status.kind]);
  // The TV's own autostart: webOS often keeps the app alive behind the screen and only brings it back on power-on
  // (webOSRelaunch, then visible again), so the start above never runs a second time. Coming back with nothing playing,
  // the startup channel plays again, as on a cold start.
  const relaunchState = useRef({ settings, recents, channels, unlocked, playing, vodPlay, multiview, book, redo });
  relaunchState.current = { settings, recents, channels, unlocked, playing, vodPlay, multiview, book, redo };
  useEffect(() => {
    const resume = () => {
      const s = relaunchState.current;
      if (document.hidden || !s.unlocked || s.book === null || s.redo) return;
      if (s.playing || s.vodPlay || s.multiview || s.channels.length === 0) return;
      const mode = s.settings.startup;
      const c = mode === "last" ? s.recents[0] : mode === "channel" ? s.channels.find((x) => channelKey(x) === s.settings.startupChannel) : undefined;
      if (c) setPlaying({ list: s.channels, index: s.channels.indexOf(c) });
    };
    const onVisible = () => { if (!document.hidden) resume(); };
    document.addEventListener("webOSRelaunch", resume);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("webOSRelaunch", resume);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
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
  // The control last focused on the page, so Right from the menu (or its icon of the open place) returns exactly there.
  const lastContent = useRef<string | null>(null);
  const backToContent = () => {
    if (section === "live" && !sheet && liveEntry.current?.enter()) return;
    const all = Array.from(document.querySelectorAll<HTMLElement>(".content [data-focus]"));
    // Never a text field first: it would open the TV's keyboard.
    (all.find((e) => e.dataset.focus === lastContent.current) ?? all.find((e) => !(e instanceof HTMLInputElement)))?.focus();
  };
  /** The menu's place lit now: Live TV drawn as the guide is still Home. */
  const railSection: Section = section === "guide" && guideAsLive ? "live" : section;
  /** Live TV as the list or as the guide (Вид экрана › Прямой эфир открывается в виде; the toolbar's «Вид телегида»). */
  const showLiveAs = (view: "list" | "guide") => {
    if (settings.liveOpensIn !== view) setSettings((cur) => ({ ...cur, liveOpensIn: view }));
    setGuideAsLive(view === "guide");
    setSection(view === "guide" ? "guide" : "live");
  };
  /** The menu's item of the place open now (or the gear while Settings is up): where focus lands on entering the menu. */
  const railTarget = () => (sheet ? "nav-settings" : `nav-${NAV.some(([id]) => id === railSection) ? railSection : "live"}`);
  const focusRail = () => { document.querySelector<HTMLElement>(`.tb-rail [data-focus="${railTarget()}"]`)?.focus(); };
  /** Closes the menu: focus back into the screen (the channels: the open categories, else the current row). */
  const closeMenuToContent = () => { backToContent(); setRailOpen(false); };
  /**
   * OK on a menu item (OwnTVShell.kt selectFromNav, TV-box): another place opens with the focus in it and the menu
   * closes; the place already open closes the menu (on the channels, the categories beside it first).
   */
  const goTo = (id: Section) => {
    if (id !== railSection || sheet) {
      setSheet(false);
      // Home opens Live TV the way it is set to open; the menu's Guide is the plain guide.
      const asGuide = id === "live" && settings.liveOpensIn === "guide";
      setGuideAsLive(asGuide);
      setSection(asGuide ? "guide" : id);
      // The new screen focuses itself as it opens; if it has not after a moment, the focus is put into it.
      let tries = 0;
      const settle = () => {
        if (!document.activeElement?.closest(".tb-rail")) return;
        if (++tries > 20) { backToContent(); return; }
        setTimeout(settle, 50);
      };
      setTimeout(settle, 50);
      return;
    }
    if (id === "live" && liveEntry.current?.closeBeside()) return;
    closeMenuToContent();
  };
  const toggleFavorite = (c: Channel) => setFavorites((f) => toggle(f, favKey(c)));
  const doomed = deleting ? pl.store.list.find((p) => p.id === deleting) : undefined;
  // A programme still to come (the guide, the search, the player's day of a channel): watch its channel or be reminded.
  const programmeDialog = upcoming ? (
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
  ) : null;

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
          // player functions (Android): zoom and audio/subtitle choice are remembered per film or whole series
          trackKey={`${playlistId}:${vodPlay.meta.kind}:${vodPlay.meta.itemId}`}
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
        onMultiview={openMultiview} onArchiveOf={openArchive} onUpcoming={openUpcoming}
        archive={playing.archive ?? null} onLive={() => setPlaying((cur) => (cur ? { list: cur.list, index: cur.index } : cur))}
        onArchive={(programme, url) => setPlaying((cur) => (cur ? { list: cur.list, index: cur.index, archive: { programme, url } } : cur))}
        onGo={(to) => { setSection(to); exitPlayer(); }}
        settings={liveSettings} onChangeSettings={changeFromPlayer}
        suspended={prompt !== null || upcoming !== null}
        // player functions (Android): the playlist's own "Stop retrying after"
        playlistId={playlistId}
      />
      {programmeDialog}
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
      <main class={`content${section === "live" ? " home-on" : ""}${railOpen ? " menu-pushed" : ""}`} onFocusIn={(e) => { const id = (e.target as HTMLElement).dataset?.focus; if (id) lastContent.current = id; }}>
        {section === "live" ? (
          <LiveView
            channels={channels} favorites={favorites} status={pl.status} settings={liveSettings}
            onOpen={open} onFav={toggleFavorite}
            onAddPlaylist={() => openSheet("playlists", "screen")} onDemo={pl.addDemo}
            greeting={greeting} playlistName={pl.active?.name ?? null} onPickPlaylist={() => setPicking(true)}
            recents={recents} paused={book === null || redo} /* the wizard covers the screen: no preview stream may hold the TV's only decoder behind it */
            onGuideView={() => showLiveAs("guide")} onUpcoming={openUpcoming} onArchive={openArchive} entry={liveEntry}
            adultLocked={settings.adultLock ? adultLocked : null} onAdult={toggleAdult}
          />
        ) : null}
        {/* guide-sport-search: the programme menu sets or cancels a reminder and (un)favours the channel in place (Android GuideProgrammeMenu). */}
        {section === "guide" ? <GuideView settings={settings} channels={channels} favorites={favorites} status={guide.status} onRefresh={() => void guide.sync()} onOpen={open} onArchive={openArchive} onUpcoming={openUpcoming} reminded={reminded}
          onFav={toggleFavorite}
          onRemind={(c, p) => { if (reminded(c, p)) rem.remove({ channel: channelKey(c), start: p.start }); else if (canRemind(p.start, Date.now())) rem.add({ channel: channelKey(c), channelName: c.name, title: p.title, start: p.start, stop: p.stop, lead: settings.reminderLead }); }} /> : null}
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
        {/* guide-sport-search: films and series are searched too (Android SearchScreen); OK on one opens its card. */}
        {section === "search" ? <SearchView channels={channels} favorites={favorites} onOpen={open} onArchive={openArchive} onUpcoming={openUpcoming} reminded={reminded} onFav={toggleFavorite}
          settings={settings} vod={vod} onOpenVod={(item, kind) => setDetails({ item, kind })} /> : null}
      </main>
      {/* After the page in the document, so a plain "first control" is never in the menu. The side menu (StageRail.kt, TV-box): out of sight until ◀ brings the focus to it; then an 84-wide strip at the
          left edge, the screen pushed right by its width. "sk" on top, the places in the middle, the profile at the bottom. */}
      <nav
        class={`tb-rail${railOpen ? " open" : ""}`} data-collapsed={railOpen ? undefined : ""}
        onFocusIn={(e) => {
          setRailOpen(true);
          // Every entry from the screen lands on the place open now, not on whatever icon lines up.
          const from = (e as FocusEvent).relatedTarget as Node | null;
          if (!from || !(e.currentTarget as HTMLElement).contains(from)) {
            const target = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-focus="${railTarget()}"]`);
            if (target && target !== e.target) target.focus();
          }
        }}
        onKeyDown={(e) => {
          const k = e.key;
          const code = e.keyCode;
          // ▶ always leaves for the screen, back to where the viewer was; ◀ goes nowhere.
          if (k === "ArrowRight" || code === 39) { e.preventDefault(); e.stopPropagation(); closeMenuToContent(); return; }
          if (k === "ArrowLeft" || code === 37) { e.preventDefault(); e.stopPropagation(); return; }
          // ▲/▼ walk the items in order and stop at the ends (never into the screen beside the menu).
          const dir = k === "ArrowUp" || code === 38 ? -1 : k === "ArrowDown" || code === 40 ? 1 : 0;
          if (dir === 0) return;
          e.preventDefault(); e.stopPropagation();
          const all = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-focus]"));
          const at = all.indexOf(document.activeElement as HTMLElement);
          all[Math.max(0, Math.min(all.length - 1, at + dir))]?.focus();
        }}
        onFocusOut={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setRailOpen(false); }}
      >
        <img class="tb-rail-logo" src={skLogo} alt="" onClick={() => goTo("live")} />
        <div class="tb-rail-mid">
          {NAV.map(([id, icon, label]) => (
            <button class={`st-focusable tb-rail-item${railSection === id && !sheet ? " active" : ""}`} key={id} data-focus={`nav-${id}`} aria-label={t(label)} aria-current={railSection === id && !sheet} onClick={() => goTo(id)}>
              <StageIcon name={icon} size={32} />
            </button>
          ))}
          <button class={`st-focusable tb-rail-item${sheet ? " active" : ""}`} data-focus="nav-settings" aria-label={t("homeNavMore")} aria-current={sheet}
            onClick={() => { if (section === "live") liveEntry.current?.closeBeside(); openSheet(null, "menu"); }}>
            <StageIcon name="gear" size={32} />
          </button>
          {full ? (
            <button class="st-focusable tb-rail-item" data-focus="nav-full" aria-label={t(full.on ? "fullScreenExit" : "fullScreen")} onClick={full.toggle}>
              <Icon name={full.on ? "fullscreen_exit" : "fullscreen"} size={32} />
            </button>
          ) : null}
        </div>
        {me ? (
          <button class="tb-rail-avatar" data-focus="nav-profile" aria-label={me.guest ? t("guestName") : me.name} onClick={() => openSheet("profile", "menu")}>
            <span>{((me.guest ? t("guestName") : me.name).trim().slice(0, 1) || "?").toUpperCase()}</span>
          </button>
        ) : null}
      </nav>
      {/* The clock, the date and the weather (StageStatus.kt): on every screen but Settings; the menu does not move it. */}
      {!sheet ? <HomeStatus look={settings} /> : null}
      {backAt ? <div class="toast home-exit-toast" role="status"><span>{t("homePressBackAgain")}</span></div> : null}
      <Presence show={sheet} ms={300}>
        {(out) => (
          <SettingsSheet
            show={!out} page={sheetPage} onPage={(pg) => { setSheetFrom("menu"); setSheetPage(pg); }} onClose={() => setSheet(false)} onBack={sheetBack}
            settings={settings} onChange={setSettings} store={pl.store} status={pl.status}
            onAddPlaylist={pl.add} onAddPlaylistFile={pl.addFile} onSelectPlaylist={pl.select} onRefreshPlaylist={pl.refresh} onEditPlaylist={pl.update} onAskDeletePlaylist={setDeleting}
            onAskReset={() => setResetting(true)}
            guide={{ data: guide.data, status: guide.status, outcomes: guide.outcomes, onRefresh: () => void guide.sync(), onClear: guide.clear }}
            channelCount={pl.channels.length} active={pl.active} headerGuides={pl.headerGuides}
            book={book ?? firstBook("", true)} onSwitchProfile={switchTo} onAddProfile={addOne}
            onRenameProfile={(name) => { if (book) updateBook(renameProfile(book, book.activeId, name)); }} onAskDeleteProfile={askDeleteProfile}
            onSetPin={askNewPin} onRemovePin={removePin} onToggleKids={toggleKids} onToggleAdultLock={toggleAdultLock}
            onQr={(name, address) => setQr({ name, address })}
            update={update} onRedoWizard={() => { setSheet(false); setRedo(true); }} channels={channels}
          />
        )}
      </Presence>
      <Presence show={picking}>
        {(out) => (
          <PlaylistPicker store={pl.store} onSelect={pl.select} onClose={() => setPicking(false)} closing={out}
            onManage={() => { setPicking(false); openSheet("playlists", "picker"); }} />
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
      {programmeDialog}
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
        // Wizard port (Android SetupWizard): it adds the playlist and watches the import itself (`playlists`), shows the
        // guide's state on its last step and can open Settings › TV guide; the new profile gets the kids mark and PIN.
        <Wizard settings={settings} hasProfile={book !== null} onPreview={setSettings}
          playlists={pl} guideLoading={guide.status.kind === "syncing"} guideAttached={pl.headerGuides.length > 0 || settings.epgSources.length > 0}
          onAddGuide={() => openSheet("sources", "menu")} /* Android: Settings › EPG sources (here the "sources" page) */
          onFinish={(r) => { const fresh = book === null; finishWizard(r); const made = fresh ? loadBook() : null; if (made) updateBook(withWizardProfile(made, r)); setTimeout(backToContent, 0); }}
          onCancel={redo ? () => { setRedo(false); setTimeout(backToContent, 0); } : undefined} />
      ) : null}
      {/* The terms of use (Android TermsOfUseScreen), once per TERMS_VERSION, over the wizard; it keeps its own state. */}
      <Terms />
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
