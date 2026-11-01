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
  /** A dialog of the app is over the picture (a reminder): the remote is its, not the player's. */
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

function Tile(p: { id: string; icon: IconName; label: Key; onClick: () => void; active?: boolean }) {
  return (
    <button class={`tile${p.active ? " active" : ""}`} data-focus={p.id} onClick={p.onClick}>
      <span class="tile-icon"><Icon name={p.icon} size={44} /></span>
      <span class="tile-label">{t(p.label)}</span>
    </button>
  );
}

const CH_UP = [427, 33];
const SEEK_MS = SEEK_STEP_S * 1000;
const CH_DOWN = [428, 34];

/**
 * Full-screen playback. Keys: OK pauses and resumes; Up or Down first show the action bar, then step through the
 * channels; Right opens the recently watched, Left the channels (each from its own edge); the channel keys always step; Back closes what is open, then leaves.
 * Timeshift, as on Android: OK pauses the live picture too, and once it runs behind the live edge (or in a recording
 * from the archive) Left and Right wind it 30 s instead, and the bar has "Live". "From the start" plays the programme
 * on air from the archive of a channel that keeps one.
 */
export function PlayerView({ channels, catalog, index, favorites, recents, onPick, closing, onStep, onFav, onExit, settings, onChangeSettings, onGo, archive, onLive, onArchive, suspended = false }: Props) {
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
  // A list that opens inside the bar itself, in place of its buttons.
  const [strip, setStrip] = useState<null | "favorites" | "recent">(null);
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState<PanelTab>("channels");
  const [side, setSide] = useState<"left" | "right">("right");
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const wake = (withBar = false) => {
    if (panel) return; // an open menu keeps the strip and the bar
    setInfo(true);
    if (withBar) setBar(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { setInfo(false); setBar(false); setStrip(null); }, settings.osdSeconds * 1000);
  };
  // The strip shows on every new channel, then goes by itself; a paused picture keeps it.
  useEffect(() => { setBar(false); setStrip(null); wake(); return () => clearTimeout(hideTimer.current); }, [channel.id]);
  useEffect(() => { if (paused) { clearTimeout(hideTimer.current); setInfo(true); } else wake(); }, [paused]);

  // An open panel keeps the info strip on screen and it does not go away by itself.
  const openPanel = (to: PanelTab, from: "left" | "right" = "right") => { setTab(to); setSide(from); setPanel(true); setInfo(true); setBar(false); clearTimeout(hideTimer.current); };
  const stripList = strip === "favorites" ? catalog.filter((c) => favorites.has(channelKey(c))) : strip === "recent" ? recents : [];
  const openStrip = (to: "favorites" | "recent") => { setStrip(to); clearTimeout(hideTimer.current); setTimeout(() => focusFirst(document, "ps-first"), 30); };
  // OK arms the bar: the Down that follows it opens the bar instead of stepping to the next channel.
  const ok = useRef(false);

  // Capture phase: the player decides first, so Back closes the menu before it leaves the player.
  useEffect(() => {
    const swallow = (e: KeyboardEvent) => { e.stopPropagation(); e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      if (suspended) return;
      if (isBack(e)) {
        swallow(e);
        if (panel) setPanel(false);
        else if (strip) { const was = strip; setStrip(null); setTimeout(() => focusFirst(document, was === "favorites" ? "pl-favs" : "pl-recent"), 30); }
        else if (bar) setBar(false);
        else if (info && state !== "failed" && !paused) { clearTimeout(hideTimer.current); setInfo(false); }
        else onExit();
        return;
      }
      if (state === "failed") return; // the error screen has its own buttons
      const up = e.key === "ArrowUp";
      const down = e.key === "ArrowDown";
      if (CH_UP.includes(e.keyCode)) { swallow(e); onStep(1); return; }
      if (CH_DOWN.includes(e.keyCode)) { swallow(e); onStep(-1); return; }
      const left = e.key === "ArrowLeft";
      const right = e.key === "ArrowRight";
      if (panel) {
        // Left walks deeper into the menu (channels, categories, home), Right walks back and then closes it.
        const edge = side === "left" ? left : right; // the key that leads away from the picture
        const back = side === "left" ? right : left;
        if (tab === "channels" && side === "left") {
          if (edge) { swallow(e); setTab("groups"); return; }
          if (back) { swallow(e); setPanel(false); return; }
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
        if (down && (ok.current || paused)) { ok.current = false; wake(true); setTimeout(() => focusFirst(document, "pl-play"), 30); return; }
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
      if (e.key === "Enter" || e.keyCode === 13 || e.keyCode === 415 || e.keyCode === 19) {
        // OK on the picture pauses it; on a button of the bar it presses that button.
        if (!bar) { swallow(e); ok.current = true; setTimeout(() => { ok.current = false; }, settings.osdSeconds * 1000); playPause(); wake(); }
        else wake(true);
        return;
      }
      swallow(e);
      wake();
    };
    const onMove = (e: MouseEvent) => { if (e.movementX !== 0 || e.movementY !== 0) wake(); };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousemove", onMove, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousemove", onMove, true);
    };
  }, [info, bar, strip, panel, tab, side, state, paused, channel.id, archive?.url, shifted, liveBehind, suspended]);

  useEffect(() => { if (state === "failed") focusFirst(document, "pl-retry"); }, [state]);

  const looks = settings.aspect === "fit" ? "contain" : settings.aspect === "fill" ? "fill" : "cover";
  return (
    <div class={`player${info ? " info" : ""}${bar ? " with-bar" : ""}${closing ? " closing" : ""}`}>
      <video ref={video} class="video" style={{ objectFit: looks }} autoplay playsInline />
      <div class="player-shade" />

      <div class={`spinner${state === "loading" ? " on" : ""}`} aria-label={t("playerLoading")} />
      {recording ? <div class="rec-badge" role="status"><span />{t("recBadge")}</div> : null}
      {paused ? <div class="paused" aria-label={t("playerPaused")}><Icon name="pause" size={96} /></div> : null}

      {/* What is on, as in the phone version: the logo, the programme, its time and what is left, the channel, what is next. */}
      <div class="pinfo">
        <div class="pinfo-logo"><ChannelLogo channel={channel} /></div>
        <div class="pinfo-text">
          <div class="pinfo-title">{onNow ? onNow.title : channel.name}</div>
          <div class="pinfo-line">
            {archive ? <span class="pinfo-arch">{t("playerArchive")}</span> : null}
            {onNow ? <span>{clock(onNow.start)} – {clock(onNow.stop)}</span> : null}
            {onNow ? <span class="pinfo-bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></span> : null}
            {archive ? <span>{elapsed(position)} / {elapsed(length)}</span> : onNow ? <span>{leftLabel(onNow.stop, guide.now)}</span> : null}
            {shifted ? <span class="pinfo-arch">{t("playerBehind", { t: elapsed(behind * 1000) })}</span> : null}
            <b>{index + 1}</b><b>{channel.name}</b>
          </div>
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
          />
        )}
      </Presence>

      {bar && state !== "failed" ? (
        strip ? (
          <div class="player-bar player-strip" role="list" aria-label={t(strip === "favorites" ? "favorites" : "panelRecent")}>
            {stripList.length === 0 ? <div class="strip-empty">{t(strip === "favorites" ? "favoritesEmpty" : "recentEmpty")}</div> : stripList.map((c, i) => (
              <button class="strip-card" key={c.id} data-focus={i === 0 ? "ps-first" : `ps-${c.id}`} onClick={() => { onPick(c, stripList); setStrip(null); setBar(false); }}>
                <span class="strip-logo"><ChannelLogo channel={c} /></span>
                <span class="strip-name">{c.name}</span>
              </button>
            ))}
          </div>
        ) : (
        <div class="player-bar">
          {archive || shifted ? <Tile id="pl-live" icon="live_tv" label="playerLive" onClick={toLive} /> : null}
          {archive ? null : <Tile id="pl-prev" icon="skip_previous" label="playerPrev" onClick={() => onStep(-1)} />}
          <Tile id="pl-back" icon="chevron_left" label="playerBack30" onClick={() => seek(-SEEK_MS)} />
          <Tile id="pl-play" icon={paused ? "play" : "pause"} label={paused ? "playerPlay" : "playerPause"} onClick={playPause} />
          {archive || shifted ? <Tile id="pl-fwd" icon="chevron" label="playerFwd30" onClick={() => seek(SEEK_MS)} /> : null}
          {archive ? null : <Tile id="pl-next" icon="skip_next" label="playerNext" onClick={() => onStep(1)} />}
          {startOver && live.now ? <Tile id="pl-start" icon="history" label="playerStartOver" onClick={() => onArchive(live.now as Programme, startOver)} /> : null}
          <Tile id="pl-fav" icon={favorite ? "favorite" : "star"} label="playerFavorite" onClick={() => onFav(channel)} />
          <Tile id="pl-favs" icon="list" label="favorites" onClick={() => openStrip("favorites")} />
          <Tile id="pl-recent" icon="history" label="panelRecent" onClick={() => openStrip("recent")} />
          {canRecord ? <Tile id="pl-rec" icon={recording ? "stop" : "record"} label={recording ? "recStop" : "recRecord"} onClick={toggleRecord} active={recording} /> : null}
          {canPip ? <Tile id="pl-mini" icon="pip" label="playerMini" onClick={pip} /> : null}
          <Tile id="pl-set" icon="settings" label="playerSettings" onClick={() => openPanel("settings", "right")} />
          <Tile id="pl-list" icon="home" label="playerMenu" onClick={() => openPanel("channels", "left")} />
          {full ? <Tile id="pl-full" icon={full.on ? "fullscreen_exit" : "fullscreen"} label={full.on ? "fullScreenExit" : "fullScreen"} onClick={full.toggle} /> : null}
        </div>
        )
      ) : null}
    </div>
  );
}
