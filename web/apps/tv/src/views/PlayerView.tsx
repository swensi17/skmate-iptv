import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  archiveUrl, behindLive, lagBehind, LIVE_EDGE_S, pickMirrors, startOverUrl, timeshiftPhpAlternate, VOD_SEEK_STEP_S,
  type Channel, type LiveAnchor, type SeekWindow,
} from "@skmate/core";
import type { Programme } from "@skmate/epg";
import { defaultZoom, itemPrefs, showAudioTile, showSubtitleTile, type ZoomMode } from "@skmate/player";
import { Drawer, focusFirst, Icon, isBack, Presence, type IconName } from "@skmate/ui";
import { t } from "../i18n";
import { remoteKey, type RemoteKey } from "../platform";
import { channelKey } from "../state/favorites";
import { desktop, startRecording, stopRecording, useFullScreen, useRecording } from "../state/desktop";
import { GuideContext } from "../state/GuideContext";
import type { Settings } from "../state/settings";
import { UiContext } from "../state/UiContext";
import { usePlayback } from "../state/usePlayback";
import { clock } from "../time";
import { ChannelLogo } from "./ChannelLogo";
import {
  AspectDialog, ClassicHud, clockSec, CornerClock, Loading, PauseMark, PlayerError, RecBadge, resolutionChip, signed, SleepDialog, Tool,
  TrackDialog, TrackGlyph, useTick, useZoomStyle,
} from "./PlayerChrome";
import { PlayerPanel, type DockRect, type Go, type PanelTab } from "./PlayerPanel";
import { PlayerSettingRows } from "./PlayerRows";
import { aboutText, ProgrammePoster } from "./ProgrammeArt";
import { StreamCorner, StreamFactsLine, useStreamFacts } from "./StreamCorner";
import { useProgrammeArt, type ArtSettings } from "../state/tmdb";
import "./player.css";

export type { Go, PanelTab };

interface Props {
  channels: readonly Channel[];
  /** The whole playlist: copies of a channel are looked up here, not only in the list being browsed. */
  catalog: readonly Channel[];
  index: number;
  favorites: ReadonlySet<string>;
  /** Recently watched channels, the latest first. */
  recents: readonly Channel[];
  /** A channel picked in a side list: it plays, and [list] is what the channel keys step through. */
  onPick: (c: Channel, list: readonly Channel[]) => void;
  /** The player is leaving: it fades out. */
  closing: boolean;
  /** A step through the list, +1 or -1: applied to the latest position, so a held key never works from a stale one. */
  onStep: (delta: number) => void;
  onFav: (c: Channel) => void;
  onExit: () => void;
  settings: Settings;
  onChangeSettings: (s: Settings) => void;
  /** Leave the player for another place of the app (the side menu's Sport, Guide, Search). */
  onGo: (to: Go) => void;
  /** A past programme played from the provider's recording; null for the live stream. */
  archive: { programme: Programme; url: string } | null;
  /** Back from the recording to the channel live. */
  onLive: () => void;
  /** Play [programme] from the provider's archive at [url] (the timeline's rewind into the archive). */
  onArchive: (programme: Programme, url: string) => void;
  /** Open the multiview with [channel] as its first tile (the setting is on, a channel is live). */
  onMultiview: (channel: Channel) => void;
  /** Kept for the App's wiring; the TV-box panel's day only shows (Android), so these are not called. */
  onArchiveOf?: (channel: Channel, programme: Programme, list: readonly Channel[]) => void;
  onUpcoming?: (channel: Channel, programme: Programme, list: readonly Channel[]) => void;
  /** A dialog of the app is over the picture (a reminder, a programme to come): the remote is its, not the player's. */
  suspended?: boolean;
  /** The playlist the channels come from: its own "Stop retrying after" applies when it has one. */
  playlistId?: string;
}

/** What the player can wind through now: the seekable range, else what is buffered; null before any picture. */
function seekWindow(el: HTMLVideoElement): SeekWindow | null {
  const r = el.seekable.length > 0 ? el.seekable : el.buffered;
  if (r.length === 0) return null;
  const start = r.start(0);
  const end = r.end(r.length - 1);
  return Number.isFinite(end) && end > start ? { start, end } : null;
}

/** The live window a stream reports (hls.js does, the TV's own decoder may not); null when none. */
function liveWindow(el: HTMLVideoElement): SeekWindow | null {
  if (el.seekable.length === 0) return null;
  const start = el.seekable.start(0);
  const end = el.seekable.end(el.seekable.length - 1);
  return Number.isFinite(end) && end - start > LIVE_EDGE_S ? { start, end } : null;
}

/** PlayerHud.kt: the info hides 4.5 s after the last key (here the "OSD" setting), 8 s on the timeline or the tiles. */
const BUSY_HIDE_MS = 8_000;
/** The seek counter stays 1.5 s after the last press; a press later starts a new run. */
const SEEK_RUN_SHOW_MS = 1_500;
/** A new archive address is opened once the run of presses rests (a TV re-opens a stream per address). */
const SCRUB_APPLY_MS = 900;
/** CatchupJumps.MIN_OFFSET_SEC: the first step back from the live edge is at least a minute. */
const MIN_OFFSET_SEC = 60;
const DIRECT_TUNE_TIMEOUT_MS = 2_000;
const DIRECT_TUNE_FEEDBACK_MS = 1_500;
const MAX_DIRECT_TUNE_DIGITS = 5;
/** The share of the screen's width at each side where a pointer click opens the channel lists (POINTER_EDGE). */
const POINTER_EDGE = 0.22;
/** A stall longer than this gets the "reconnecting" line under the spinner. */
const RECONNECT_NOTICE_MS = 10_000;

/** One ◀ ▶ step: 10 s a press; held, 30 s, a minute, five (archiveSeekStepSec, by the key's repeat count). */
function archiveStepSec(repeat: number): number {
  return repeat < 8 ? 10 : repeat < 20 ? 30 : repeat < 40 ? 60 : 300;
}

/** The wall-clock moment each archive address opened by the timeline starts at (the address itself does not say). */
const SCRUB_FROM = new Map<string, number>();

/** The programme on [list] at [at], and the one after it. */
function programmeAt(list: readonly Programme[], at: number): { now: Programme | null; next: Programme | null } {
  const i = list.findIndex((x) => x.start <= at && at < x.stop);
  if (i >= 0) return { now: list[i] as Programme, next: list[i + 1] ?? null };
  return { now: null, next: list.find((x) => x.start > at) ?? null };
}

/** The archive address that starts at [at]: the programme on air from there (startOverUrl), or a past one. */
function scrubUrl(channel: Channel, list: readonly Programme[], at: number, now: number): { url: string; programme: Programme } | null {
  const p = programmeAt(list, at).now ?? { start: at, stop: Math.min(now, at + 3_600_000), title: channel.name };
  const url = p.stop > now ? startOverUrl(channel, at, p.stop, now) : archiveUrl(channel, at, p.stop, now);
  return url ? { url, programme: p } : null;
}

type Step = "info" | "seek" | "tiles";
interface TileDef { id: string; icon: IconName; label: string; run: () => void; active?: boolean; glyph?: "audio" | "subtitle" }

/**
 * Full-screen playback, as the Android TV app's TV-box player (PlayerHud.kt, docs/android-design-spec.md §2d.8):
 * - Hidden: OK shows the info; ▲ ▼ change channel (and show it); ◀ the channel panel, ▶ the recently watched; in the
 *   archive ◀ ▶ move through it. Back leaves the player. CH± zap from anywhere, the digits tune a channel by number.
 * - Info: OK pauses and plays; ▼ the timeline (where ◀ ▶ rewind, a channel with an archive or a live window and a
 *   guide), ▼ again the tiles; ▲ and Back step back up.
 * - A programme opened from the guide's archive gets the classic HUD instead (top bar, transport, seek bar).
 */
export function PlayerView(p: Props) {
  const { channels, catalog, index, settings, archive, suspended = false } = p;
  const channel = channels[index] as Channel;
  const video = useRef<HTMLVideoElement>(null);
  const full = useFullScreen();
  const ui = useContext(UiContext);
  const guide = useContext(GuideContext);
  // A recording plays from its own address; its only fallback is the PHP form some Xtream panels need instead.
  const target = useMemo(() => (archive ? { ...channel, url: archive.url } : channel), [channel, archive?.url]);
  const mirrors = useMemo(() => {
    if (!archive) return pickMirrors(channel, catalog);
    const alt = timeshiftPhpAlternate(archive.url);
    return alt ? [{ ...channel, url: alt }] : [];
  }, [channel.id, catalog, archive?.url]);
  // Timeshift: the live stream opened this far behind its edge, on hls.js (the TV's own decoder cannot); 0 = live.
  const [liveBehind, setLiveBehind] = useState(0);
  useEffect(() => { setLiveBehind(0); }, [channel.id, archive?.url]);
  // Android "Stop retrying after": the playlist's own value, else the setting (0 = never); live only (LiveTuneController).
  const tuneSecs = (p.playlistId ? settings.tuneTimeoutPerPlaylist[p.playlistId] : undefined) ?? settings.tuneTimeout;
  const itemKey = channelKey(channel);
  const { state, engine, paused, retry, togglePause, tracks, selectAudio, selectSubtitle, reason, facts: engineFacts } = usePlayback(video, target, {
    engine: settings.engine, openTimeoutMs: settings.openTimeout * 1000, autoRestart: settings.autoRestart,
    // A recording is played like a film: Settings › films and archive buffer (0 = Auto, hls.js' own); live keeps the live delay.
    bufferSeconds: archive ? settings.vodBuffer : settings.buffer,
    liveBehindSeconds: liveBehind,
    tuneBudgetMs: archive ? 0 : Math.max(0, tuneSecs) * 1000,
    log: settings.playbackLog,
    trackKey: itemKey,
    explain: true,
  }, mirrors);
  // A stream hls.js could not open behind its edge plays live again rather than end on an error screen.
  useEffect(() => { if (state === "failed" && liveBehind > 0) setLiveBehind(0); }, [state, liveBehind]);

  // The archive opened by the timeline keeps the TV-box look; one opened from the guide gets the classic HUD.
  const scrubFrom = archive ? SCRUB_FROM.get(archive.url) : undefined;
  const tvLive = !archive || scrubFrom !== undefined;
  const programmes = guide.data.of(channel.id);

  // Position in a recording, read once a second.
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    if (!archive) return;
    setPosition(0);
    const id = setInterval(() => {
      const el = video.current;
      setPosition((el?.currentTime ?? 0) * 1000);
      if (el && Number.isFinite(el.duration)) setDuration(el.duration * 1000);
    }, 1000);
    return () => clearInterval(id);
  }, [archive?.url]);

  // Live: how far behind the edge the picture is (hls.js knows its window; other engines are timed by the clock).
  const anchor = useRef<LiveAnchor | null>(null);
  const pausedAt = useRef<number | null>(null);
  const [behind, setBehind] = useState(0);
  const liveSeen = useRef<{ yes: boolean; duration: number }>({ yes: false, duration: 0 });
  useEffect(() => { liveSeen.current = { yes: false, duration: 0 }; }, [channel.id, archive?.url]);
  const isLive = (el: HTMLVideoElement): boolean => {
    const seen = liveSeen.current;
    if (!seen.yes && el.readyState > 0) {
      if (!Number.isFinite(el.duration) || (seen.duration > 0 && el.duration > seen.duration + 0.5)) seen.yes = true;
      else if (Number.isFinite(el.duration)) seen.duration = el.duration;
    }
    return seen.yes;
  };
  // hls.js plays a live stream some segments behind its window's end on its own: that distance, taken once the
  // picture runs, is the live edge here, so a fresh channel is not counted as rewound.
  const edge = useRef<number | null>(null);
  const measure = (el: HTMLVideoElement): number => {
    if (!isLive(el)) return 0;
    const w = liveWindow(el);
    if (!w) return (liveBehind > 0 ? liveBehind : 0) + lagBehind(anchor.current, Date.now() / 1000, el.currentTime);
    const raw = w.end - el.currentTime;
    if (edge.current === null && liveBehind === 0 && el.readyState >= 2 && !el.paused) edge.current = raw;
    return behindLive({ start: w.start, end: w.end - (edge.current ?? 0) }, el.currentTime);
  };
  useEffect(() => {
    const el = video.current;
    anchor.current = engine && el && !archive ? { wall: Date.now() / 1000, media: el.currentTime } : null;
    edge.current = null;
  }, [engine, archive?.url, channel.id]);
  useEffect(() => {
    setBehind(0);
    if (archive) return;
    const id = setInterval(() => { const el = video.current; if (el) setBehind(measure(el)); }, 1000);
    return () => clearInterval(id);
  }, [archive?.url, channel.id, liveBehind]);

  // What can be rewound: a channel with an archive, or an hls.js live stream (its window, or reopened behind).
  const canArchive = (channel.catchupDays ?? 0) > 0;
  const canShift = typeof MediaSource !== "undefined" && /\.m3u8(\?|$)/i.test(channel.url);
  const nowAtOpen = guide.data.nowNext(channel.id, Date.now()).now;
  /** Android: the timeline steps exist only with something to rewind and a guide to draw them on. */
  const canScrub = tvLive && (canArchive || canShift) && (nowAtOpen !== null || scrubFrom !== undefined);

  // ---- The HUD's state (PlayerHud.kt) ----
  const [shown, setShown] = useState(true);
  const [step, setStep] = useState<Step>("info");
  // The same, written at once: two keys pressed faster than a render must see what the first one did.
  const hud = useRef<{ shown: boolean; step: Step; panel: PanelTab | null }>({ shown: true, step: "info", panel: null });
  const [panel, setPanel] = useState<PanelTab | null>(null);
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState<"aspect" | "sleep" | "audio" | "subs" | null>(null);
  // Zoom (OwnTVPlayer setZoomModeByUser): each channel starts at the default zoom unless one was picked for it.
  const zoomFor = (key: string): ZoomMode => itemPrefs.get(key)?.zoom ?? defaultZoom(settings.zoomMode, settings.aspect);
  const [aspect, setAspect] = useState<ZoomMode>(() => zoomFor(itemKey));
  useEffect(() => { setAspect(zoomFor(itemKey)); }, [itemKey, settings.zoomMode, settings.aspect]);
  const pickZoom = (z: ZoomMode) => { setAspect(z); itemPrefs.rememberZoom(itemKey, z); };
  const [dock, setDock] = useState<DockRect | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  /** The tile that opened a dialog or the sheet, focused again when it closes. */
  const lastTile = useRef<string | null>(null);
  const inert = panel !== null || sheet || dialog !== null || suspended;

  const tick = useTick(1000, shown || panel !== null);
  // Seconds behind live and the moment on screen: the clock less that.
  const offsetSec = scrubFrom !== undefined ? Math.max(0, (tick - (scrubFrom + position)) / 1000) : archive ? 0 : behind;

  // A run of ◀ ▶ presses: the seconds moved (+ toward live) from where it began; the counter shows it.
  const [run, setRun] = useState<{ moved: number; base: number } | null>(null);
  const runAt = useRef(0);
  const repeat = useRef(0);
  const applyTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!run) return;
    const id = setTimeout(() => setRun(null), SEEK_RUN_SHOW_MS + SCRUB_APPLY_MS);
    return () => clearTimeout(id);
  }, [run]);
  const watching = run ? Math.min(Date.now(), run.base + run.moved * 1000) : tick - offsetSec * 1000;
  const at = programmeAt(programmes, watching);

  const wake = (busy = hud.current.step !== "info") => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { hud.current.shown = false; setShown(false); }, busy ? BUSY_HIDE_MS : settings.osdSeconds * 1000);
  };
  const show = (s: Step = "info") => { if (s !== "tiles") lastTile.current = null; hud.current.shown = true; hud.current.step = s; setShown(true); setStep(s); wake(s !== "info"); };
  const hide = () => { lastTile.current = null; clearTimeout(hideTimer.current); hud.current.shown = false; setShown(false); };
  // Every channel opened shows the info, which then goes by itself; a paused picture (TV-box) keeps it.
  useEffect(() => { show("info"); return () => clearTimeout(hideTimer.current); }, [channel.id, archive?.url]);
  useEffect(() => { if (paused && tvLive) { clearTimeout(hideTimer.current); hud.current.shown = true; setShown(true); } else if (shown) wake(); }, [paused]);
  useEffect(() => { if (inert) clearTimeout(hideTimer.current); else if (shown) wake(); }, [inert]);

  const toLive = () => {
    setRun(null);
    if (archive) { p.onLive(); return; }
    setBehind(0);
    if (liveBehind > 0) setLiveBehind(0);
    else { const el = video.current; const w = el ? liveWindow(el) : null; if (el && w) el.currentTime = w.end - (edge.current ?? 3); else retry(); }
  };
  /** Opens the moment [target] (wall clock): live at the edge, else the archive, else the live window behind. */
  const applyScrub = (target: number) => {
    const now = Date.now();
    if (target >= now - LIVE_EDGE_S * 1000) { toLive(); return; }
    if (canArchive) {
      const found = scrubUrl(channel, programmes, target, now);
      if (found) { SCRUB_FROM.set(found.url, target); p.onArchive(found.programme, found.url); }
      return;
    }
    const el = video.current;
    if (!el) return;
    const desired = (now - target) / 1000;
    const w = liveWindow(el);
    if (w) { el.currentTime = Math.max(w.start, w.end - (edge.current ?? 0) - desired); setBehind(measure(el)); }
    else if (canShift) setLiveBehind(Math.round(desired));
  };
  const scrub = (back: boolean, rep: number) => {
    const now = Date.now();
    const fresh = !run || now - runAt.current > SEEK_RUN_SHOW_MS;
    const stepS = archiveStepSec(rep);
    const fromLive = back && offsetSec <= 1 && fresh;
    const applied = fromLive ? Math.max(stepS, MIN_OFFSET_SEC) : stepS;
    const base = fresh ? tick - offsetSec * 1000 : (run as { base: number }).base;
    let moved = (fresh ? 0 : (run as { moved: number }).moved) + (back ? -applied : applied);
    moved = Math.min(moved, Math.max(0, (now - base) / 1000)); // never past the live edge
    runAt.current = now;
    setRun({ moved, base });
    clearTimeout(applyTimer.current);
    applyTimer.current = setTimeout(() => applyScrub(base + moved * 1000), SCRUB_APPLY_MS);
    show("seek");
  };
  useEffect(() => () => clearTimeout(applyTimer.current), []);
  // A piece of the archive ran out: the next one, from where it ended.
  useEffect(() => {
    const el = video.current;
    if (!el || scrubFrom === undefined) return;
    const onEnded = () => applyScrub(scrubFrom + el.currentTime * 1000);
    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [scrubFrom, archive?.url]);

  // OK on the picture. A live pause on an engine without a live window resumes by reopening the stream as far
  // behind as the pause lasted, so nothing of the programme is missed (Android's timeshift).
  const playPause = () => {
    const el = video.current;
    if (!archive && el && !paused) pausedAt.current = Date.now() / 1000;
    if (!archive && el && paused && pausedAt.current !== null && !liveWindow(el) && canShift) {
      const lag = measure(el) + (Date.now() / 1000 - pausedAt.current);
      pausedAt.current = null;
      if (lag > LIVE_EDGE_S) { setLiveBehind(Math.round(lag)); return; }
    }
    togglePause();
  };
  const seekBy = (s: number) => {
    const el = video.current;
    if (!el) return;
    const end = Number.isFinite(el.duration) ? el.duration : duration / 1000;
    el.currentTime = Math.max(0, Math.min(el.currentTime + s, Math.max(0, end - 1)));
    setPosition(el.currentTime * 1000);
  };

  // ---- Direct tune: the digits pick a channel by its number in the list (PlayerHud.kt:390-490) ----
  const [digits, setDigits] = useState("");
  const [tuneNote, setTuneNote] = useState<{ digits: string; error: string } | { channel: Channel; n: number } | null>(null);
  const tuneTimer = useRef<ReturnType<typeof setTimeout>>();
  const submit = (d: string) => {
    clearTimeout(tuneTimer.current);
    setDigits("");
    const n = Number(d);
    const c = n >= 1 ? channels[n - 1] : undefined;
    if (!c) { setTuneNote({ digits: d, error: t("tbNotFound") }); return; }
    setTuneNote({ channel: c, n });
    if (c.id !== channel.id) p.onPick(c, channels);
  };
  const digit = (n: number) => {
    const d = digits + String(n);
    clearTimeout(tuneTimer.current);
    setTuneNote(null);
    if (d.length >= MAX_DIRECT_TUNE_DIGITS) { submit(d); return; }
    setDigits(d);
    tuneTimer.current = setTimeout(() => submit(d), DIRECT_TUNE_TIMEOUT_MS);
  };
  // The result stays until the new picture plays (at most 8 s), then 1.5 s more.
  useEffect(() => {
    if (!tuneNote) return;
    const wait = "channel" in tuneNote && state === "loading" ? 8_000 : DIRECT_TUNE_FEEDBACK_MS;
    const id = setTimeout(() => setTuneNote(null), wait);
    return () => clearTimeout(id);
  }, [tuneNote, state]);
  useEffect(() => { if (inert) { clearTimeout(tuneTimer.current); setDigits(""); } }, [inert]);
  useEffect(() => () => clearTimeout(tuneTimer.current), []);

  const zap = (d: number) => {
    clearTimeout(tuneTimer.current);
    setDigits("");
    setRun(null);
    p.onStep(d);
    show("info");
  };
  const previous = p.recents.find((c) => c.id !== channel.id) ?? null;
  const goPrevious = () => {
    if (!previous) return;
    hide();
    p.onPick(previous, channels.some((c) => c.id === previous.id) ? channels : catalog);
  };

  // ---- Panels ----
  const startOfPanel = useRef<{ c: Channel; list: readonly Channel[] } | null>(null);
  const openPanel = (kind: PanelTab) => {
    if (kind === "history" && p.recents.length === 0) return; // nothing is drawn for an empty history
    hide();
    startOfPanel.current = null;
    hud.current.panel = kind;
    setPanel(kind);
  };
  const closePanel = () => {
    const start = startOfPanel.current;
    startOfPanel.current = null;
    hud.current.panel = null;
    setPanel(null);
    // Back after previewing others: the channel that was on when the panel opened plays again.
    if (start && start.c.id !== channel.id) p.onPick(start.c, start.list);
  };

  // ---- Sleep timer ----
  const [sleepAt, setSleepAt] = useState<number | null>(null);
  useEffect(() => {
    if (sleepAt === null) return;
    const id = setInterval(() => { if (Date.now() >= sleepAt) { setSleepAt(null); p.onExit(); } }, 5_000);
    return () => clearInterval(id);
  }, [sleepAt]);

  // ---- Recording (the Windows app only), the mini window and full screen where they exist ----
  const recId = channelKey(channel);
  const recording = useRecording(recId);
  const canRecord = !archive && desktop() !== null;
  const toggleRecord = () => {
    const now = at.now;
    if (recording) stopRecording(recId);
    else startRecording(recId, channel.url, now ? `${channel.name} ${now.title}` : channel.name, channel.headers ?? {}, now?.stop ?? null);
  };
  const canPip = typeof document !== "undefined" && (document as unknown as { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled === true;
  const pip = () => { video.current?.requestPictureInPicture().catch(() => undefined); };
  const favorite = p.favorites.has(channelKey(channel));

  // The tiles (PlayerHud.kt:883-912), each only where it can work here.
  const tiles: TileDef[] = [
    { id: "tb-guide", icon: "epg", label: t("tbGuide"), run: () => { hide(); p.onGo("guide"); } },
    { id: "tb-list", icon: "list", label: t("tbChannels"), run: () => openPanel("channels") },
    ...(p.recents.length > 0 ? [{ id: "tb-history", icon: "history" as IconName, label: t("tbHistory"), run: () => openPanel("history") }] : []),
    ...(previous ? [{ id: "tb-prev", icon: "skip_previous" as IconName, label: t("tbPrevChannel"), run: goPrevious }] : []),
    { id: "tb-fav", icon: favorite ? "favorite" : "star", label: t(favorite ? "tbFavorited" : "tbFavorite"), run: () => p.onFav(channel), active: favorite },
    ...(canRecord ? [{ id: "tb-rec", icon: "record" as IconName, label: t(recording ? "tbRecordStop" : "tbRecord"), run: toggleRecord, active: recording }] : []),
    // Audio with a choice to make (more than one track), subtitles with any (PlayerHud.kt:903-904).
    ...(showAudioTile(tracks.audio) ? [{ id: "tb-audio", icon: "volume_high" as IconName, glyph: "audio" as const, label: t("pfAudio"), run: () => setDialog("audio") }] : []),
    ...(showSubtitleTile(tracks.subs) ? [{ id: "tb-subs", icon: "info" as IconName, glyph: "subtitle" as const, label: t("pfSubtitles"), run: () => setDialog("subs") }] : []),
    { id: "tb-aspect", icon: "aspect", label: t("tbAspect"), run: () => setDialog("aspect") },
    ...(canPip ? [{ id: "tb-mini", icon: "pip" as IconName, label: t("tbMini"), run: () => { hide(); pip(); } }] : []),
    ...(settings.multiview && !archive ? [{ id: "tb-mv", icon: "grid" as IconName, label: t("tbMultiview"), run: () => { hide(); p.onMultiview(channel); } }] : []),
    { id: "tb-sleep", icon: "clock", label: t("tbSleep"), run: () => setDialog("sleep"), active: sleepAt !== null },
    ...(full ? [{ id: "tb-full", icon: (full.on ? "fullscreen_exit" : "fullscreen") as IconName, label: t(full.on ? "fullScreenExit" : "fullScreen"), run: full.toggle }] : []),
    { id: "tb-set", icon: "settings", label: t("playerSettings"), run: () => { hide(); setSheet(true); } },
  ];
  // The row opens on its first tile; back from a tile's dialog, the focus returns to that tile.
  useEffect(() => {
    if (!shown || step !== "tiles" || inert) return;
    const id = lastTile.current && tiles.some((x) => x.id === lastTile.current) ? lastTile.current : tiles[0]?.id;
    lastTile.current = null;
    setTimeout(() => focusFirst(document, id), 16);
  }, [shown, step, inert]);
  const runTile = (x: TileDef) => { lastTile.current = x.id; x.run(); };

  // ---- Remote keys. Capture phase: the player decides first; a panel, a dialog or the sheet takes its own. ----
  const okDownOn = useRef<string | null>(null);
  useEffect(() => {
    const swallow = (e: KeyboardEvent) => { e.stopPropagation(); e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      if (suspended || panel !== null || hud.current.panel !== null) return; // the panel's own handler runs after this one
      const shown = hud.current.shown;
      const step = hud.current.step;
      const back = isBack(e);
      if (sheet || dialog) {
        if (back) { swallow(e); if (dialog) setDialog(null); else setSheet(false); }
        return;
      }
      const k: RemoteKey | null = remoteKey(e);
      const rep = e.repeat ? ++repeat.current : (repeat.current = 0);
      // Digits are taken whatever is on screen (direct tune), at the live edge of a channel, while Settings › typed
      // channel numbers is on (OwnTVShell.kt:2080 onTuneToNumber = directTuneEnabled && …); off, they do nothing.
      if (k !== null && typeof k === "object") {
        swallow(e);
        if (settings.directTune && !archive && state !== "failed" && offsetSec <= 1 && !e.repeat) digit(k.digit);
        return;
      }
      if (digits !== "") {
        if (k === "ok") { swallow(e); submit(digits); return; }
        if (back) { swallow(e); clearTimeout(tuneTimer.current); setDigits(""); return; }
      }
      // The channel keys belong to the player for its whole life.
      if (k === "chUp" || k === "next") { swallow(e); zap(1); return; }
      if (k === "chDown" || k === "prev") { swallow(e); zap(-1); return; }
      if (k === "lastChannel") { swallow(e); goPrevious(); return; }
      // The error screen has its own Retry; Back leaves the player.
      if (state === "failed") {
        if (back) { swallow(e); p.onExit(); return; }
        if (k === "ok") return; // the focused Retry is pressed
        if (k === "up" || k === "down" || k === "left" || k === "right") swallow(e);
        return;
      }
      if (!tvLive) { classicKey(e, k, back); return; }

      const hidden = !shown;
      if (back) {
        swallow(e);
        if (hidden) p.onExit();
        else if (step === "info") hide();
        else show("info"); // from the timeline or the tiles: back to the info
        return;
      }
      if (hidden) {
        swallow(e);
        if (k === "up") { zap(1); return; }
        if (k === "down") { zap(-1); return; }
        if (k === "left" || k === "right") {
          if (canScrub && offsetSec > 1) scrub(k === "left", rep); // in the archive ◀ ▶ always move through it
          else openPanel(k === "left" ? "channels" : "history");
          return;
        }
        if (k === "channelList") { openPanel("channels"); return; }
        if (!e.repeat) show("info"); // OK and any other key show the info
        return;
      }
      if (k === "playPause" || k === "play" || k === "pause") { swallow(e); if (!e.repeat) playPause(); wake(); return; }
      if (step === "tiles") {
        const ids = tiles.map((x) => x.id);
        const at = ids.indexOf((document.activeElement as HTMLElement | null)?.dataset.focus ?? "");
        if (k === "left" || k === "right") {
          swallow(e);
          const to = Math.max(0, Math.min(ids.length - 1, (at < 0 ? 0 : at) + (k === "left" ? -1 : 1))); // the ends are walls
          focusFirst(document, ids[to]);
          wake(true);
          return;
        }
        if (k === "up") { swallow(e); show(canScrub ? "seek" : "info"); return; }
        if (k === "ok") { swallow(e); if (!e.repeat) okDownOn.current = at >= 0 ? (ids[at] as string) : null; wake(true); return; }
        swallow(e);
        wake(true);
        return;
      }
      swallow(e);
      if (k === "ok") { if (!e.repeat) playPause(); wake(); return; }
      if (step === "seek") {
        if (k === "left" || k === "right") { scrub(k === "left", rep); return; }
        if (k === "up") { show("info"); return; }
        if (k === "down") { show("tiles"); return; }
        wake(true);
        return;
      }
      // The info step.
      if (k === "down") { show(canScrub ? "seek" : "tiles"); return; }
      if (k === "up") { hide(); return; }
      if (k === "left" || k === "right") {
        if (canScrub && offsetSec > 1) scrub(k === "left", rep);
        else openPanel(k === "left" ? "channels" : "history");
        return;
      }
      wake();
    };
    // The classic HUD over a recording from the guide: the arrows walk its buttons, ◀ ▶ on the bar wind it.
    const classicKey = (e: KeyboardEvent, k: RemoteKey | null, back: boolean) => {
      const shown = hud.current.shown;
      if (back) { swallow(e); if (shown) hide(); else p.onExit(); return; }
      if (k === "rewind" || k === "forward") { swallow(e); seekBy(k === "rewind" ? -VOD_SEEK_STEP_S : VOD_SEEK_STEP_S); show(); return; }
      if (!shown) {
        swallow(e);
        if (k === "left" || k === "right") {
          seekBy(k === "left" ? -VOD_SEEK_STEP_S : VOD_SEEK_STEP_S);
          show();
          setTimeout(() => focusFirst(document, "ch-seek"), 16);
          return;
        }
        if (e.repeat) return;
        show();
        setTimeout(() => focusFirst(document, "ch-play"), 16);
        return;
      }
      if (k === "playPause" || k === "play" || k === "pause") { swallow(e); playPause(); wake(); return; }
      const onBar = (document.activeElement as HTMLElement | null)?.dataset.focus === "ch-seek";
      if (onBar && (k === "left" || k === "right")) { swallow(e); seekBy(k === "left" ? -VOD_SEEK_STEP_S : VOD_SEEK_STEP_S); wake(); return; }
      wake(); // the rest (arrows between the buttons, OK on one) is the page's own
    };
    // OK on a tile acts on its release, and only for a press that also went down there (TvBoxLiveHud.kt:55-74).
    const onKeyUp = (e: KeyboardEvent) => {
      if (remoteKey(e) !== "ok" || okDownOn.current === null) return;
      const id = okDownOn.current;
      okDownOn.current = null;
      const el = document.activeElement as HTMLElement | null;
      const tile = tiles.find((x) => x.id === id);
      if (el?.dataset.focus === id && tile) { e.preventDefault(); runTile(tile); }
    };
    const onMove = (e: MouseEvent) => { if (!inert && (e.movementX !== 0 || e.movementY !== 0) && state !== "failed") { if (!shown) show(); else wake(); } };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("mousemove", onMove, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("mousemove", onMove, true);
    };
  });

  // The classic HUD comes with the focus on Play; the error screen with it on Retry (150 ms after it opens).
  useEffect(() => { if (!tvLive && shown && !inert && !(document.activeElement as HTMLElement | null)?.closest(".ch-hud")) setTimeout(() => focusFirst(document, "ch-play"), 16); }, [shown, tvLive]);
  useEffect(() => { if (state === "failed" && !inert) { const id = setTimeout(() => focusFirst(document, "pl-retry"), 150); return () => clearTimeout(id); } return undefined; }, [state, inert]);

  // The first picture fades in from black (250 ms after it plays, over 320 ms), only when the player opens.
  const [revealed, setRevealed] = useState(false);
  const [coverGone, setCoverGone] = useState(false);
  useEffect(() => { if (state === "playing") setRevealed(true); }, [state]);
  useEffect(() => { if (!revealed) return; const id = setTimeout(() => setCoverGone(true), 650); return () => clearTimeout(id); }, [revealed]);
  // Opening: "reconnecting" under the spinner after 10 s of a stall of a stream that had played.
  const [stalled, setStalled] = useState(false);
  const played = useRef(false);
  useEffect(() => {
    setStalled(false);
    if (state === "playing") { played.current = true; return; }
    if (state !== "loading" || !played.current) return;
    const id = setTimeout(() => setStalled(true), RECONNECT_NOTICE_MS);
    return () => clearTimeout(id);
  }, [state]);
  useEffect(() => { played.current = false; }, [channel.id]);

  // The picture in the docked corner is always fitted (no scale spilling over the panel); full screen has the zoom.
  const look = useZoomStyle(video, dock ? "fit" : aspect);
  const videoStyle = dock
    ? { ...look, left: `${dock.x}px`, top: `${dock.y}px`, width: `${dock.w}px`, height: `${dock.h}px` }
    : look;
  const chips = [resolutionChip(video.current?.videoHeight ?? 0), engine && settings.showEngine ? engine : null].filter((x): x is string => !!x);
  const number = ui.numbers ? String(index + 1) : null;
  const failed = state === "failed";

  // ---- TV-box info (TvBoxPlayerInfo.kt) ----
  const cur = at.now;
  // A film or a series on air: its poster in the logo's place and what it is about under the times (TMDB, 2.5.3).
  const artSettings = useMemo<ArtSettings>(() => ({
    metadataOn: settings.metadataOn, tmdbKey: settings.tmdbKey, tmdbLanguage: settings.tmdbLanguage, programmePosters: settings.programmePosters,
  }), [settings.metadataOn, settings.tmdbKey, settings.tmdbLanguage, settings.programmePosters]);
  const art = useProgrammeArt(tvLive && cur && watching < cur.stop ? cur.title : null, artSettings);
  const about = art ? aboutText(art) : "";
  // What the stream is (2.5.3/2.5.4): on the right of the line of what follows, refreshed every two seconds while shown.
  const streamFacts = useStreamFacts(video, engineFacts, shown && tvLive && !inert && state === "playing", `${channel.id}|${archive?.url ?? ""}`);
  const progress = cur ? Math.max(0, Math.min(1, (watching - cur.start) / Math.max(1, cur.stop - cur.start))) : 1;
  const info = (
    <>
      <div class={`tb-row${art ? " art" : ""}`}>
        {/* The logo gives way to the poster in a short fade (2.5.4); the poster's own picture fades in as it loads. */}
        {art
          ? <div class="tb-art" key={art.posterUrl}><ProgrammePoster url={art.posterUrl} width={120} /></div>
          : <div class="tb-logo" key="logo"><ChannelLogo channel={channel} /></div>}
        <div class="tb-text">
          <div class="tb-title">{cur ? cur.title : t("tbNoGuide")}</div>
          <div class="tb-line">
            {cur ? <span>{t("tbRange", { a: clock(cur.start), b: clock(cur.stop) })}</span> : null}
            {cur ? <span class="tb-mini"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span> : null}
            {cur ? <span>{t("tbMinutes", { n: Math.max(0, Math.floor((cur.stop - watching) / 60_000)) })}</span> : null}
            <span class="tb-ch">{number ? <span class="tb-num">{number}</span> : null}{channel.name}</span>
            {chips.slice(0, 4).map((c) => <span class="tb-chip" key={c}>{c}</span>)}
          </div>
          {about ? <div class="tb-about">{about}</div> : null}
          {/* What follows on the left; on its right, level with it, what the stream is (2.5.4 nextLine). */}
          {at.next || streamFacts ? (
            <div class="tb-line tb-next">
              {at.next ? <span>{t("tbRange", { a: clock(at.next.start), b: clock(at.next.stop) })}</span> : null}
              <span class="tb-next-title">{at.next ? at.next.title : ""}</span>
              {streamFacts ? <StreamFactsLine facts={streamFacts} /> : null}
            </div>
          ) : null}
        </div>
      </div>
      <div class={`tb-time${step === "seek" ? " seeking" : ""}`}>
        <div class="tb-track"><i style={{ width: `${(progress * 100).toFixed(2)}%` }} /></div>
        <div class={`tb-dot${offsetSec > 1 || (run && run.moved < 0) ? " behind" : ""}`} style={{ left: `${(progress * 100).toFixed(2)}%` }} />
        {run && Date.now() - runAt.current <= SEEK_RUN_SHOW_MS + 100 ? (
          <div class="tb-counter" style={{ left: `${(progress * 100).toFixed(2)}%`, transform: `translateX(-${(progress * 100).toFixed(2)}%)` }}>
            {t("tbSeekCounter", { d: signed(Math.round(run.moved)), t: clockSec(watching) })}
          </div>
        ) : null}
      </div>
    </>
  );

  // ---- The classic HUD's guide card (LiveEpgCard.kt): what plays, then what is on air now, dimmed ----
  const liveNow = guide.data.nowNext(channel.id, tick).now;
  const epgCard = archive ? (
    <div class="ch-epg">
      <div class="ch-epg-card archive">
        <div class="ch-epg-label">{t("tbArchivePlaying")}</div>
        <div class="ch-epg-title">{archive.programme.title}</div>
        <div class="ch-epg-time">{t("tbRange", { a: clock(archive.programme.start), b: clock(archive.programme.stop) })}</div>
      </div>
      {liveNow ? (
        <div class="ch-epg-card dim">
          <div class="ch-epg-label">{t("tbLiveNow")}</div>
          <div class="ch-epg-title">{liveNow.title}</div>
          <div class="ch-epg-time">{t("tbLiveRemaining", { t: clock(liveNow.start), n: Math.max(0, Math.floor((liveNow.stop - tick) / 60_000)) })}</div>
        </div>
      ) : null}
    </div>
  ) : null;
  const archiveLength = archive ? Math.max(duration, archive.programme.stop - archive.programme.start) : 0;

  // A mouse or an air remote's pointer (af69acf): a click on the left edge opens the channel list as ◀ does, on the
  // right edge the recently watched as ▶, anywhere else shows or hides the info. Controls on screen take their own clicks.
  const onPointer = (e: MouseEvent) => {
    if (inert || panel !== null) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, input, .tp, .tb-tiles, .ch-hud, [data-modal]")) return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - box.left;
    const edge = box.width * POINTER_EDGE;
    if (tvLive && !failed && x < edge) { hide(); openPanel("channels"); return; }
    if (tvLive && !failed && x > box.width - edge && p.recents.length > 0) { hide(); openPanel("history"); return; }
    if (failed) return;
    if (hud.current.shown) hide(); else show("info");
  };

  return (
    <div class={`player pv${p.closing ? " closing" : ""}`} onClick={onPointer}>
      <video ref={video} class="video pv-video" style={videoStyle} autoplay playsInline />
      {coverGone ? null : <div class={`pv-cover${revealed ? " off" : ""}`} />}

      <Loading on={state === "loading" && panel === null} classic={!tvLive} stalled={stalled} />
      {/* Settings › player clock: over the whole picture only, never beside the panel (OwnTVShell.kt:1950-1954). */}
      {settings.playerClock && !dock && panel === null ? (
        <CornerClock size={settings.clockSize} weight={settings.clockWeight} bg={settings.clockBg} color={settings.clockColor} alpha={settings.clockAlpha} />
      ) : null}
      {recording ? <RecBadge /> : null}
      {paused && tvLive && !failed && !inert ? <PauseMark /> : null}

      {/* Top-start: the digits being typed, or what they found. */}
      {digits !== "" || tuneNote ? (
        <div class={`pv-osd${shown && !tvLive ? " raised" : ""}`}>
          {tuneNote && "channel" in tuneNote ? (
            <div class="pv-tuned">
              <div class="pv-tuned-logo"><ChannelLogo channel={tuneNote.channel} /></div>
              <div class="pv-tuned-text">
                <div class="pv-tuned-name">{tuneNote.channel.name}</div>
                <div class="pv-tuned-sub">{t("tbChannelNumber", { n: tuneNote.n })}</div>
              </div>
            </div>
          ) : (
            <div class="pv-card" key={digits}>
              <div class="pv-card-label">{t("tbChannelLabel")}</div>
              <div class="pv-card-digits">{digits || (tuneNote && "digits" in tuneNote ? tuneNote.digits : "")}{digits ? <span class="pv-caret" /> : null}</div>
              {tuneNote && "error" in tuneNote ? <div class="pv-card-error">{tuneNote.error}</div> : null}
              {digits ? <div class="pv-card-bar"><i /></div> : null}
            </div>
          )}
        </div>
      ) : null}

      {tvLive ? (
        <Presence show={shown && !failed && !inert}>
          {(out) => (
            <div class={`tb-hud${out ? " out" : ""}${step === "tiles" ? " tiles" : ""}`}>
              <div class="tb-shade" />
              {/* Top right, as on other TV players: the clock and the date (TvBoxStreamCorner.kt). */}
              <StreamCorner />
              <div class="tb-col">
                {info}
                {step === "tiles" ? (
                  <div class="tb-tiles" role="toolbar">
                    {tiles.map((x) => (
                      <button key={x.id} class={`tb-tile${x.active ? " active" : ""}`} data-focus={x.id} aria-pressed={x.active} onClick={(ev) => { if ((ev as MouseEvent).detail > 0) runTile(x); }}>
                        <span class="tb-disc">{x.glyph ? <TrackGlyph kind={x.glyph} size={32} /> : <Icon name={x.icon} size={32} />}</span>
                        <span class="tb-tile-label">{x.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </Presence>
      ) : (
        <Presence show={shown && !failed && !inert}>
          {(out) => (
            <ClassicHud
              closing={out} logo={<ChannelLogo channel={channel} />} chips={chips} number={number} title={channel.name} live
              now={tick} watching={archive ? archive.programme.start + position : null} epg={epgCard} paused={paused}
              onBack={() => { hide(); p.onExit(); }} onPlayPause={playPause}
              onRewind={() => { seekBy(-VOD_SEEK_STEP_S); wake(); }} onForward={() => { seekBy(VOD_SEEK_STEP_S); wake(); }}
              position={position} duration={archiveLength}
              media={(
                <>
                  <button class="ch-golive" data-focus="ch-live" onClick={toLive}><i />{t("tbGoLive")}</button>
                  {/* The classic dock always has both, with a count badge (PlayerHudChrome.kt:404-407). */}
                  <Tool id="ch-subs" icon="info" glyph={<TrackGlyph kind="subtitle" size={47} />} label={t("pfSubtitles")} badge={tracks.subs.length || null} onClick={() => setDialog("subs")} />
                  <Tool id="ch-audio" icon="volume_high" glyph={<TrackGlyph kind="audio" size={47} />} label={t("pfAudio")} badge={tracks.audio.length > 1 ? tracks.audio.length : null} onClick={() => setDialog("audio")} />
                  <Tool id="ch-fav" icon={favorite ? "favorite" : "star"} label={t("tbFavorite")} active={favorite} onClick={() => p.onFav(channel)} />
                </>
              )}
              tools={(
                <>
                  <Tool id="ch-aspect" icon="aspect" label={t("tbAspect")} active={aspect !== "fit"} onClick={() => setDialog("aspect")} />
                  {canPip ? <Tool id="ch-mini" icon="pip" label={t("tbMini")} onClick={pip} /> : null}
                  <Tool id="ch-sleep" icon="clock" label={t("tbSleep")} active={sleepAt !== null} onClick={() => setDialog("sleep")} />
                </>
              )}
            />
          )}
        </Presence>
      )}

      {failed ? <PlayerError quiet={panel !== null} onRetry={retry} retryId="pl-retry" reason={reason} /> : null}

      <Presence show={panel !== null}>
        {(out) => (
          <PlayerPanel
            kind={panel ?? "channels"} closing={out}
            channels={channels} catalog={catalog} playing={channel} recents={p.recents} favorites={p.favorites}
            preview={settings.preview} loading={state === "loading"}
            onPick={(c, list) => { startOfPanel.current = null; hud.current.panel = null; setPanel(null); if (c.id !== channel.id) p.onPick(c, list); }}
            onPreview={(c, list) => { if (!startOfPanel.current) startOfPanel.current = { c: channel, list: channels }; p.onPick(c, list); }}
            onDismiss={closePanel}
            onGo={(to) => { hud.current.panel = null; setPanel(null); p.onGo(to); }}
            onSettings={() => { startOfPanel.current = null; hud.current.panel = null; setPanel(null); setSheet(true); }}
            onDock={setDock}
            art={artSettings}
            // The channel's archive under the picture (2.5.3): OK on an aired programme plays it, the panel closes.
            onArchive={(c, prog, list) => { startOfPanel.current = null; hud.current.panel = null; setPanel(null); p.onArchiveOf?.(c, prog, list); }}
          />
        )}
      </Presence>

      <Presence show={sheet}>
        {(out) => (
          <Drawer variant="sheet" title={t("panelSettings")} label={t("panelSettings")} closing={out} onClose={() => setSheet(false)}>
            <div class="st-sheet-body"><SettingsFocus /><PlayerSettingRows settings={settings} onChange={p.onChangeSettings} /></div>
          </Drawer>
        )}
      </Presence>
      {dialog === "aspect" ? (
        <AspectDialog value={aspect} onClose={() => setDialog(null)} onPick={(a) => { setDialog(null); pickZoom(a); }} />
      ) : null}
      {dialog === "audio" || dialog === "subs" ? (
        <TrackDialog kind={dialog === "audio" ? "audio" : "subtitle"} tracks={dialog === "audio" ? tracks.audio : tracks.subs} onClose={() => setDialog(null)}
          onPick={(x) => { setDialog(null); if (dialog === "audio") { if (x) selectAudio(x); } else selectSubtitle(x); }} />
      ) : null}
      {dialog === "sleep" ? (
        <SleepDialog
          leftMs={sleepAt !== null ? sleepAt - Date.now() : null}
          endLabel={!archive && liveNow ? t("tbSleepEndProgramme") : null}
          onClose={() => setDialog(null)}
          onPick={(m) => {
            setDialog(null);
            setSleepAt(m === null ? null : m === "end" ? (liveNow?.stop ?? null) : Date.now() + m * 60_000);
          }}
        />
      ) : null}
    </div>
  );
}

/** The settings sheet opens on its first row. */
function SettingsFocus() {
  useEffect(() => { const id = setTimeout(() => focusFirst(document, "s-engine"), 40); return () => clearTimeout(id); }, []);
  return null;
}
