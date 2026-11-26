import { Spinner } from "./Spinner";
import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { behindLive, lagBehind, LIVE_EDGE_S, pickMirrors, SEEK_STEP_S, startOverUrl, timeshiftPhpAlternate, windTo, type Channel, type LiveAnchor, type SeekWindow } from "@skmate/core";
import type { Programme } from "@skmate/epg";
import { focusFirst, Icon, isBack, Presence, type IconName } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { channelKey } from "../state/favorites";
import { desktop, startRecording, stopRecording, useFullScreen, useRecording } from "../state/desktop";
import { GuideContext } from "../state/GuideContext";
import type { Settings } from "../state/settings";
import { usePlayback } from "../state/usePlayback";
import { clock } from "../time";
import { leftLabel } from "./Left";
import { ChannelLogo } from "./ChannelLogo";
import { PlayerPanel, type Go, type PanelTab } from "./PlayerPanel";
import "./player-wizard.css";

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
  /** Leave the player for another place of the app (the main menu's Home, Guide, Sport, Search). */
  onGo: (to: Go) => void;
  /** A past programme played from the provider's recording; null for the live stream. */
  archive: { programme: Programme; url: string } | null;
  /** Back from the recording to the channel live. */
  onLive: () => void;
  /** Play [programme] from the provider's archive at [url]: "From the start" of the programme on air. */
  onArchive: (programme: Programme, url: string) => void;
  /** Open the multiview with [channel] as its first tile (the setting is on, a channel is live). */
  onMultiview: (channel: Channel) => void;
  /** A past programme of a channel in the side list's day: its recording (or the channel live when it keeps none). */
  onArchiveOf: (channel: Channel, programme: Programme, list: readonly Channel[]) => void;
  /** A programme still to come in that day: the app asks to watch the channel or set a reminder. */
  onUpcoming: (channel: Channel, programme: Programme, list: readonly Channel[]) => void;
  /** A dialog of the app is over the picture (a reminder, a programme to come): the remote is its, not the player's. */
  suspended?: boolean;
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


/** 1:05:09 or 5:09: how far into a recording, and how long it is. */
function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** A button of the bar. [active]: something running (a recording); [on]: a state that is set (in favourites). */
function Tile(p: { id: string; icon: IconName; label: Key; onClick: () => void; active?: boolean; on?: boolean }) {
  return (
    <button class={`tile${p.active ? " active" : ""}${p.on ? " on" : ""}`} data-focus={p.id} onClick={p.onClick} aria-pressed={p.on}>
      <span class="tile-icon"><Icon name={p.icon} size={44} /></span>
      <span class="tile-label">{t(p.label)}</span>
    </button>
  );
}

const CH_UP = [427, 33];
const SEEK_MS = SEEK_STEP_S * 1000;
const CH_DOWN = [428, 34];
/** Play (415) and Pause (19) on webOS and Tizen; Play/Pause in one key on Tizen (10252, once registered). */
const MEDIA_PLAY_PAUSE = [415, 19, 10252];

/**
 * Full-screen playback. Keys, as on the usual IPTV players (OTT Navigator, Lampa):
 * - OK shows the strip and the action bar with the focus on Pause, so a second OK pauses; nothing is paused by a press
 *   that was only meant to see what is on. On a paused picture OK plays again. Play/Pause keys of the remote always toggle.
 * - Up and Down step through the channels (the channel keys too); on the bar, Up leaves it.
 * - Left opens the channels (then the categories, then the menu), Right the recently watched, each from its own edge.
 * - Back closes what is open (panel, bar, strip), then leaves the player.
 * Timeshift, as on Android: once the picture runs behind the live edge (or in a recording from the archive) Left and
 * Right wind it 30 s instead, and the bar has "Live". "From the start" plays the programme on air from the archive of
 * a channel that keeps one. "Settings" on the bar opens the player's settings in the side panel.
 */
export function PlayerView({ channels, catalog, index, favorites, recents, onPick, closing, onStep, onFav, onExit, settings, onChangeSettings, onGo, archive, onLive, onArchive, onMultiview, onArchiveOf, onUpcoming, suspended = false }: Props) {
  const channel = channels[index] as Channel;
  const video = useRef<HTMLVideoElement>(null);
  const full = useFullScreen();
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
  const { state, engine, paused, retry, togglePause, via } = usePlayback(video, target, {
    engine: settings.engine, bufferSeconds: settings.buffer, openTimeoutMs: settings.openTimeout * 1000, autoRestart: settings.autoRestart,
    liveBehindSeconds: liveBehind,
  }, mirrors);
  // A stream hls.js could not open behind its edge plays live again rather than end on an error screen.
  useEffect(() => { if (state === "failed" && liveBehind > 0) setLiveBehind(0); }, [state, liveBehind]);
  const guide = useContext(GuideContext);
  const live = guide.data.nowNext(channel.id, guide.now);
  // In a recording the strip tells the programme being watched and how far into it, not what is on now.
  const [position, setPosition] = useState(0);
  useEffect(() => {
    if (!archive) return;
    setPosition(0);
    const id = setInterval(() => setPosition((video.current?.currentTime ?? 0) * 1000), 1000);
    return () => clearInterval(id);
  }, [archive?.url]);
  const length = archive ? Math.max(1, archive.programme.stop - archive.programme.start) : 1;
  const onNow = archive ? archive.programme : live.now;
  const next = archive ? undefined : live.next;
  const progress = archive ? Math.min(1, position / length) : live.progress;
  // Live: how far behind the edge the picture is. hls.js knows its live window, so the gap is read from it;
  // any other engine is timed by the clock since the stream opened (plus what it was opened behind).
  const anchor = useRef<LiveAnchor | null>(null);
  const pausedAt = useRef<number | null>(null);
  const [behind, setBehind] = useState(0);
  // Whether this channel's stream is really live. The TV's decoder says so with an endless duration; hls.js gives
  // a live stream a finite duration that grows. A file in a live list keeps one duration: it has no live edge.
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
  const measure = (el: HTMLVideoElement): number => {
    if (!isLive(el)) return 0;
    const w = liveWindow(el);
    return w ? behindLive(w, el.currentTime) : (liveBehind > 0 ? liveBehind : 0) + lagBehind(anchor.current, Date.now() / 1000, el.currentTime);
  };
  useEffect(() => {
    const el = video.current;
    anchor.current = engine && el && !archive ? { wall: Date.now() / 1000, media: el.currentTime } : null;
  }, [engine, archive?.url, channel.id]);
  useEffect(() => {
    setBehind(0);
    if (archive) return;
    const id = setInterval(() => { const el = video.current; if (el) setBehind(measure(el)); }, 1000);
    return () => clearInterval(id);
  }, [archive?.url, channel.id, liveBehind]);
  const shifted = !archive && behind > 0;
  /** hls.js can open a live `.m3u8` behind its edge; nothing else can, so only such a stream is timeshifted. */
  const canShift = !archive && typeof MediaSource !== "undefined" && /\.m3u8(\?|$)/i.test(target.url);
  const seek = (by: number) => {
    const el = video.current;
    if (!el) return;
    if (archive) {
      el.currentTime = Math.max(0, Math.min(el.currentTime + by / 1000, (Number.isFinite(el.duration) ? el.duration : length / 1000) - 1));
      setPosition(el.currentTime * 1000);
      return;
    }
    const w = liveWindow(el);
    if (!w && by < 0 && canShift) { setLiveBehind(measure(el) + -by / 1000); return; } // no live window here: reopen behind
    el.currentTime = windTo(w ?? seekWindow(el), el.currentTime, by / 1000).time;
    setBehind(measure(el));
  };
  // OK on the picture. A live pause on an engine without a live window resumes by reopening the stream as far
  // behind as the pause lasted, so nothing of the programme is missed — the Android timeshift's behaviour.
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
  // Back to live: opened again at the edge on the usual engines (and the clock above starts over).
  const toLive = () => {
    if (archive) { onLive(); return; }
    setBehind(0);
    if (liveBehind > 0) setLiveBehind(0);
    else retry();
  };
  const startOver = !archive && live.now ? startOverUrl(channel, live.now.start, live.now.stop) : null;
  const favorite = favorites.has(channelKey(channel));
  // A small window over other apps, where the browser has one (Chrome, Edge, the Windows app); a TV has not.
  const canPip = typeof document !== "undefined" && (document as unknown as { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled === true;
  const pip = () => { video.current?.requestPictureInPicture().catch(() => undefined); };
  // Recording the channel live to a file, as Android's "Record": only the Windows app can write one. It ends with
  // the programme on air, or when pressed again, and goes on if the player is closed.
  const recId = channelKey(channel);
  const recording = useRecording(recId);
  const canRecord = !archive && desktop() !== null;
  const toggleRecord = () => {
    if (recording) stopRecording(recId);
    else startRecording(recId, channel.url, live.now ? `${channel.name} ${live.now.title}` : channel.name, channel.headers ?? {}, live.now?.stop ?? null);
  };

  // Two layers: the info strip (what is on) and the action bar (what can be done). The panel is the side menu.
  const [info, setInfo] = useState(true);
  const [bar, setBar] = useState(false);
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState<PanelTab>("channels");
  const [side, setSide] = useState<"left" | "right">("right");
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const wake = (withBar = false) => {
    if (panel || suspended) return; // an open menu keeps the strip and the bar; so does a dialog over them
    setInfo(true);
    if (withBar) setBar(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { setInfo(false); setBar(false); }, settings.osdSeconds * 1000);
  };
  // The strip shows on every new channel, then goes by itself; a paused picture keeps it.
  useEffect(() => { setBar(false); wake(); return () => clearTimeout(hideTimer.current); }, [channel.id]);
  useEffect(() => { if (paused) { clearTimeout(hideTimer.current); setInfo(true); } else wake(); }, [paused]);

  // An open panel keeps the info strip on screen and it does not go away by itself.
  const openPanel = (to: PanelTab, from: "left" | "right" = "right") => { setTab(to); setSide(from); setPanel(true); setInfo(true); setBar(false); clearTimeout(hideTimer.current); };

  // Capture phase: the player decides first, so Back closes the menu before it leaves the player.
  useEffect(() => {
    const swallow = (e: KeyboardEvent) => { e.stopPropagation(); e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      if (suspended) return;
      if (isBack(e)) {
        swallow(e);
        if (panel) setPanel(false);
        else if (bar) setBar(false);
        else if (info && state !== "failed" && !paused) { clearTimeout(hideTimer.current); setInfo(false); }
        else onExit();
        return;
      }
      const up = e.key === "ArrowUp";
      const down = e.key === "ArrowDown";
      if (CH_UP.includes(e.keyCode)) { swallow(e); onStep(1); return; }
      if (CH_DOWN.includes(e.keyCode)) { swallow(e); onStep(-1); return; }
      // The error screen has its own buttons (OK, Right), but zapping and the channel list stay as on the picture: a
      // dead channel is exactly when the next one is wanted.
      if (state === "failed" && !panel) {
        if (up || down) { swallow(e); onStep(up ? 1 : -1); return; }
        if (e.key !== "ArrowLeft") return;
      }
      const left = e.key === "ArrowLeft";
      const right = e.key === "ArrowRight";
      if (panel) {
        // In the day of a channel Up and Down walk the programmes, Left is back to the list, Right closes the panel.
        const sched = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(".tm-sched");
        if (sched) {
          if (left) { swallow(e); focusFirst(document, `ch-${sched.dataset.ch}`); }
          else if (right) { swallow(e); setPanel(false); } // on past the day: the panel slides away to the left
          return;
        }
        // Left walks deeper into the menu (channels, categories, home), Right walks back and then closes it.
        const edge = side === "left" ? left : right; // the key that leads away from the picture
        const back = side === "left" ? right : left;
        if (tab === "channels" && side === "left") {
          if (edge) { swallow(e); setTab("groups"); return; }
          if (back) {
            // Right from the list goes to its day, when it has one; with nothing there it closes the panel.
            swallow(e);
            const day = document.querySelector<HTMLElement>(".tm-sched .sc-now") ?? document.querySelector<HTMLElement>(".tm-sched .sc-row[data-focus]");
            if (day) day.focus({ preventScroll: false }); else setPanel(false);
            return;
          }
        } else if (tab === "groups") {
          if (edge) { swallow(e); setTab("menu"); return; }
          if (back) { swallow(e); setTab("channels"); return; }
        } else if (tab === "menu") {
          if (back) { swallow(e); setTab("groups"); return; }
          if (edge) { swallow(e); return; }
        } else if ((tab === "recent" || tab === "favorites") && back) { swallow(e); if (side === "left") setTab("menu"); else setPanel(false); return; }
        return; // the panel's own lists take the rest
      }
      if (up || down) {
        swallow(e);
        if (bar) { if (up) { setBar(false); wake(); } return; } // on the bar Up leaves it
        if (down && paused) { wake(true); setTimeout(() => focusFirst(document, "pl-play"), 30); return; } // a still picture has nothing to step to
        onStep(up ? 1 : -1); // straight up and down steps through the channels
        wake();
        return;
      }
      if (left || right) {
        // Behind live or in a recording the arrows wind it back and forth, as on Android; the menus are on the bar.
        if (!bar && (archive || shifted)) { swallow(e); seek(left ? -SEEK_MS : SEEK_MS); wake(); return; }
        // On the bar the arrows walk its buttons; on the picture Left brings the channels, Right what was watched lately.
        if (!bar) { swallow(e); openPanel(left ? "channels" : "recent", left ? "left" : "right"); return; }
        wake(true);
        return;
      }
      // The remote's Play and Pause keys always play or pause, whatever is on screen.
      if (MEDIA_PLAY_PAUSE.includes(e.keyCode)) { swallow(e); playPause(); wake(); return; }
      if (e.key === "Enter" || e.keyCode === 13) {
        // On a button of the bar OK presses that button (the browser clicks it).
        if (bar) { wake(true); return; }
        swallow(e);
        // A paused picture plays again; a playing one shows the strip and the bar, the focus on Pause.
        if (paused) { playPause(); wake(); return; }
        wake(true);
        setTimeout(() => focusFirst(document, "pl-play"), 30);
        return;
      }
      swallow(e);
      wake();
    };
    const onMove = (e: MouseEvent) => { if (!suspended && (e.movementX !== 0 || e.movementY !== 0)) wake(); };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousemove", onMove, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousemove", onMove, true);
    };
  }, [info, bar, panel, tab, side, state, paused, channel.id, archive?.url, shifted, liveBehind, suspended]);

  // Not while a dialog is over the picture: the focus stays in it.
  useEffect(() => { if (state === "failed" && !suspended) focusFirst(document, "pl-retry"); }, [state]);

  const looks = settings.aspect === "fit" ? "contain" : settings.aspect === "fill" ? "fill" : "cover";
  return (
    <div class={`player${panel && tab === "channels" ? " panel-wide" : ""}${info ? " info" : ""}${bar ? " with-bar" : ""}${closing ? " closing" : ""}`}>
      <video ref={video} class="video" style={{ objectFit: looks }} autoplay playsInline />
      <div class="player-shade" />

      <Spinner class={state === "loading" ? "on" : ""} label={t("playerLoading")} />
      {recording ? <div class="rec-badge" role="status"><span />{t("recBadge")}</div> : null}
      {paused ? <div class="paused" aria-label={t("playerPaused")}><Icon name="pause" size={96} /></div> : null}

      {/* What is on, as on the usual IPTV players (TiviMate, OTT Navigator): the channel's number and name, the programme,
          its time and what is left, what is next. It stays while the action bar is up, raised above it. */}
      <div class="pinfo">
        <div class="pinfo-logo"><ChannelLogo channel={channel} /></div>
        <div class="pinfo-text">
          <div class="pinfo-head"><b class="pinfo-num">{index + 1}</b><b class="pinfo-ch">{channel.name}</b></div>
          {onNow ? <div class="pinfo-title">{onNow.title}</div> : null}
          {onNow || shifted ? (
            <div class="pinfo-line">
              {archive ? <span class="pinfo-arch">{t("playerArchive")}</span> : null}
              {onNow ? <span>{clock(onNow.start)} – {clock(onNow.stop)}</span> : null}
              {onNow ? <span class="pinfo-bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></span> : null}
              {archive ? <span>{elapsed(position)} / {elapsed(length)}</span> : onNow ? <span>{leftLabel(onNow.stop, guide.now)}</span> : null}
              {shifted ? <span class="pinfo-arch">{t("playerBehind", { t: elapsed(behind * 1000) })}</span> : null}
            </div>
          ) : null}
          {next ? <div class="pinfo-next">{clock(next.start)} – {clock(next.stop)}  {next.title}</div> : null}
          {via && !archive ? <div class="pinfo-next">{t("playerMirror", { name: via.name })}</div> : null}
          {engine && settings.showEngine ? <div class="pinfo-next">{t("playerEngine", { name: engine })}</div> : null}
        </div>
      </div>
      <div class="pline"><span style={{ width: `${Math.round(progress * 100)}%` }} /><i style={{ left: `${Math.round(progress * 100)}%` }} /></div>

      {state === "failed" ? (
        <div class="player-error" data-modal>
          <Icon name="warning" size={96} />
          <div class="player-error-title">{t("playerFailed")}</div>
          <div class="player-note">{t("playerFailedHint")}</div>
          <div class="empty-actions">
            <button class="btn" data-focus="pl-retry" onClick={retry}>{t("playerRetry")}</button>
            <button class="btn" data-focus="pl-skip" onClick={() => onStep(1)}>{t("playerNext")}</button>
            <button class="btn" data-focus="pl-back" onClick={onExit}>{t("playerBack")}</button>
          </div>
        </div>
      ) : null}

      <Presence show={panel}>
        {(out) => (
          <PlayerPanel
            side={side} tab={tab} onTab={setTab} closing={out} onClose={() => setPanel(false)}
            channels={channels} catalog={catalog} index={index} recents={recents} favorites={favorites}
            onPick={(c, list) => { onPick(c, list); setPanel(false); }} onFav={onFav}
            settings={settings} onChangeSettings={onChangeSettings} onGo={onGo}
            onArchive={(c, p, list) => { setPanel(false); onArchiveOf(c, p, list); }} onUpcoming={onUpcoming}
          />
        )}
      </Presence>

      {/* Only what is done to the picture on screen. Channels are Up/Down (and Left), the recently watched Right: no
          buttons for them here. */}
      {bar && state !== "failed" ? (
        <div class="player-bar">
          {archive || shifted ? <Tile id="pl-live" icon="live_tv" label="playerLive" onClick={toLive} /> : null}
          <Tile id="pl-back" icon="rewind" label="playerBack30" onClick={() => seek(-SEEK_MS)} />
          <Tile id="pl-play" icon={paused ? "play" : "pause"} label={paused ? "playerPlay" : "playerPause"} onClick={playPause} />
          {archive || shifted ? <Tile id="pl-fwd" icon="fast_forward" label="playerFwd30" onClick={() => seek(SEEK_MS)} /> : null}
          {startOver && live.now ? <Tile id="pl-start" icon="refresh" label="playerStartOver" onClick={() => onArchive(live.now as Programme, startOver)} /> : null}
          <Tile id="pl-fav" icon="star" label="playerFavorite" onClick={() => onFav(channel)} on={favorite} />
          {/* Only where they exist: multiview when its setting is on, recording, the mini window and full screen on a computer. */}
          {settings.multiview && !archive ? <Tile id="pl-mv" icon="grid" label="mvButton" onClick={() => onMultiview(channel)} /> : null}
          {canRecord ? <Tile id="pl-rec" icon={recording ? "stop" : "record"} label={recording ? "recStop" : "recRecord"} onClick={toggleRecord} active={recording} /> : null}
          {canPip ? <Tile id="pl-mini" icon="pip" label="playerMini" onClick={pip} /> : null}
          {full ? <Tile id="pl-full" icon={full.on ? "fullscreen_exit" : "fullscreen"} label={full.on ? "fullScreenExit" : "fullScreen"} onClick={full.toggle} /> : null}
          <Tile id="pl-set" icon="settings" label="playerSettings" onClick={() => openPanel("settings", "right")} />
        </div>
      ) : null}
    </div>
  );
}
