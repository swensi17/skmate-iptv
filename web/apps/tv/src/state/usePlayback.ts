import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import {
  audioToSelect, classifyFailure, defaultEngines, itemPrefs, PlayerLadder, probeFailure, subtitleAction, SUBTITLES_OFF,
  type EngineFacts, type EnginePreference, type FailureReason, type PlayerEngine, type TrackOption, type TrackSource,
} from "@skmate/player";

export type PlayState = "loading" | "playing" | "failed";

/** A quick Up/Down zapping must not open a stream per key press: only the channel the finger stops on is opened. */
export const ZAP_SETTLE_MS = 250;
/** Picture frozen for this long: the stream is opened again from the first engine. */
export const STALL_RESTART_MS = 15_000;

/**
 * Plays [channel] on [video]: the engines in turn, a settle delay for zapping, one automatic restart
 * when the picture freezes. Everything about *how* it plays; the screen only shows the state.
 */
export interface PlaybackOptions {
  engine: EnginePreference;
  bufferSeconds: number;
  openTimeoutMs: number;
  autoRestart: boolean;
  /** Timeshift: open the live stream this many seconds behind its edge (on hls.js); 0 or absent for live. */
  liveBehindSeconds?: number;
  /** A multiview tile without the sound takes no picture taller than this many lines. */
  maxHeight?: number;
  /**
   * Android "Stop retrying after" (LiveTuneController.startAlarm): the whole tune — every engine and every copy of
   * the channel — gets this long to show a picture, then the error screen. 0 or absent: no limit. A channel that
   * opened stands the alarm down; a later stall is the restart's business, not this one's.
   */
  tuneBudgetMs?: number;
  /** Android "Detailed playback log": every try, fallback, restart and give-up goes to the console. */
  log?: boolean;
  /** The item whose audio / subtitle choice is remembered (a channel, a film, a whole series); absent: none. */
  trackKey?: string;
  /**
   * The error screen names the reason (2.5.2): after giving up, one short request to the address asks it, when the
   * engines did not say. Only the screens that show a reason ask (the player, a film); a preview or a tile does not.
   */
  explain?: boolean;
}

export interface Tracks { audio: TrackOption[]; subs: TrackOption[] }
const NO_TRACKS: Tracks = { audio: [], subs: [] };

/** hls.js before the page's own decoder; off by default. `localStorage.setItem("skmate.hlsfirst", "0" | "1")` overrides it, to compare the two orders on a stream. */
function hlsFirstHere(): boolean {
  try { const v = localStorage.getItem("skmate.hlsfirst"); if (v === "0") return false; if (v === "1") return true; } catch { /* no storage: the default */ }
  return false; // not measured to be faster yet (a provider that is slow to start hides the difference), so the TV order stays
}

/**
 * Gives the element's decoder back at once. A TV has one hardware video decoder: a <video> that still holds a stream
 * (an engine that was still opening is not stopped by the ladder until it gives up, and an element taken off the page
 * keeps its stream until it is collected) leaves the next player's <video> without a picture ("native: timeout").
 * Called whenever a stream is left: another channel, the screen closing (preview, player, multiview tile, film).
 */
export function releaseVideo(el: HTMLVideoElement): void {
  try {
    el.pause();
    el.removeAttribute("src");
    el.load();
  } catch { /* already empty */ }
}

const sameTracks = (a: readonly TrackOption[], b: readonly TrackOption[]) =>
  a.length === b.length && a.every((x, i) => { const y = b[i] as TrackOption; return x.id === y.id && x.selected === y.selected && x.label === y.label && x.lang === y.lang; });

export function usePlayback(
  video: { current: HTMLVideoElement | null },
  channel: Channel,
  o: PlaybackOptions,
  /** Copies of this channel to try, in order, when it does not open (see `pickMirrors`). */
  mirrors: readonly Channel[] = [],
) {
  const [state, setState] = useState<PlayState>("loading");
  const [engine, setEngine] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tracks, setTracks] = useState<Tracks>(NO_TRACKS);
  // 0 = the channel itself, n = the n-th copy.
  const [hop, setHop] = useState(0);
  const source0 = hop > 0 ? mirrors[hop - 1] ?? channel : channel;
  const restarts = useRef(0);
  /** The running tune's deadline: set when a channel (or Retry) starts one, null once a picture came or with no budget. */
  const tune = useRef<{ url: string; deadline: number | null } | null>(null);
  const trackSource = useRef<TrackSource | null>(null);
  /** The engine that plays now: what it knows of the stream goes to the info (Android StreamFacts). */
  const playingEngine = useRef<PlayerEngine | null>(null);
  /** Why the channel did not open, once known (Android ErrorInfo.reason, 2.5.2): the engines' words, else a probe. */
  const [reason, setReason] = useState<FailureReason | null>(null);
  const keyRef = useRef(o.trackKey);
  keyRef.current = o.trackKey;

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const log = (line: string) => { if (o.log) console.info(`[player] ${line}`); };
    // Why an engine gave up goes to the console: the one line that tells a codec problem from a dead stream.
    const ladder = new PlayerLadder(
      defaultEngines({ preference: o.engine, hlsFirst: hlsFirstHere(), bufferSeconds: o.bufferSeconds, liveBehindSeconds: o.liveBehindSeconds, ...(o.maxHeight ? { maxHeight: o.maxHeight } : {}) }),
      { onFail: (f) => { if (f.reason !== "timeout") said.push(f.message); console.warn(`[player] ${f.message}`); }, onTry: (id) => log(`'${source0.name}' trying ${id}`) },
      { openTimeoutMs: o.openTimeoutMs },
    );
    let alive = true;
    setState("loading");
    setEngine(null);
    setPaused(false);
    setTracks(NO_TRACKS);
    setReason(null);
    trackSource.current = null;
    playingEngine.current = null;
    // What each engine said when it gave up; the last words that name a reason are the error screen's. The ladder's
    // own open timeout is not one: it says the picture did not come in time, not that the network failed.
    const said: string[] = [];
    // The player gave up: the reason from what the engines said, else one short request to the address.
    const explain = () => {
      const known = said.map(classifyFailure).filter((r): r is FailureReason => r !== null).pop() ?? null;
      if (known) { setReason(known); return; }
      if (!o.explain) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return; // the screen says "no internet" already
      const url = source0.url;
      void probeFailure(url).then((r) => {
        log(`probe after give-up: ${r.raw || "nothing"}`);
        if (!alive && gaveUpOn === url && r.reason) setReason(r.reason);
      });
    };
    let gaveUpOn: string | null = null;
    // A new channel (or Retry) is a fresh tune with the whole budget; a copy or a restart of it keeps what is left.
    if (!tune.current || tune.current.url !== channel.url) {
      tune.current = { url: channel.url, deadline: o.tuneBudgetMs && o.tuneBudgetMs > 0 ? Date.now() + o.tuneBudgetMs : null };
    }
    const outOfTime = () => tune.current?.deadline != null && Date.now() >= tune.current.deadline;
    let alarm: ReturnType<typeof setTimeout> | undefined;
    const giveUp = (why: string) => {
      if (!alive) return;
      log(`'${channel.name}' — giving up: ${why}`);
      alive = false; // nothing of this run may report any more
      clearTimeout(stall);
      clearTimeout(start);
      ladder.stop();
      releaseVideo(el);
      setState("failed");
      gaveUpOn = source0.url;
      explain();
    };
    const armAlarm = () => {
      const at = tune.current?.deadline;
      if (at == null) return;
      alarm = setTimeout(() => giveUp(`no picture within ${Math.round((o.tuneBudgetMs ?? 0) / 1000)}s of tuning`), Math.max(0, at - Date.now()));
    };
    const standDown = () => { clearTimeout(alarm); if (tune.current) tune.current.deadline = null; };

    let stall: ReturnType<typeof setTimeout> | undefined;
    const armStall = () => {
      clearTimeout(stall);
      stall = setTimeout(() => {
        if (!alive || !o.autoRestart || restarts.current >= 1) return;
        restarts.current++;
        log(`'${channel.name}' picture frozen ${STALL_RESTART_MS / 1000}s — opening it again`);
        setAttempt((n) => n + 1);
      }, STALL_RESTART_MS);
    };
    const onWaiting = () => { if (alive) { setState("loading"); armStall(); } };
    const onPlaying = () => { clearTimeout(stall); if (alive) { standDown(); setState("playing"); } };
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("playing", onPlaying);

    // The tracks of the engine that plays; a remembered language is applied once per half (TrackMemory).
    let unwatch: (() => void) | null = null;
    const recall = { audioDone: false, subDone: false };
    const attach = (src: TrackSource) => {
      trackSource.current = src;
      const prefs = keyRef.current ? itemPrefs.get(keyRef.current) : null;
      const read = () => {
        if (!alive) return;
        const audio = src.audio();
        const subs = src.subtitles();
        if (!recall.audioDone && audio.length > 0) {
          recall.audioDone = true;
          const pick = audioToSelect(audio, prefs?.audio, prefs?.audioName);
          if (pick) { log(`audio: remembered '${prefs?.audio ?? prefs?.audioName}' → track ${pick.id}`); src.selectAudio(pick.id); }
        }
        if (!recall.subDone && subs.length > 0) {
          recall.subDone = true;
          const act = subtitleAction(subs, prefs?.sub);
          if (act.kind === "off") src.selectSubtitle(null);
          else if (act.kind === "select") src.selectSubtitle(act.track.id);
        }
        setTracks((cur) => (sameTracks(cur.audio, audio) && sameTracks(cur.subs, subs) ? cur : { audio, subs }));
      };
      unwatch = src.watch(read);
      read();
    };

    const source = source0.headers ? { url: source0.url, headers: source0.headers } : { url: source0.url };
    const start = setTimeout(() => {
      armStall();
      armAlarm();
      ladder.play(el, source).then(
        (e) => {
          if (!alive) return;
          log(`'${source0.name}' opened on ${e.id}`);
          setEngine(e.id); setState("playing"); clearTimeout(stall); standDown();
          playingEngine.current = e;
          const src = e.tracks?.() ?? null;
          if (src) attach(src);
        },
        () => {
          if (!alive) return;
          clearTimeout(stall);
          if (outOfTime()) { giveUp(`no picture within ${Math.round((o.tuneBudgetMs ?? 0) / 1000)}s of tuning`); return; }
          if (hop < mirrors.length) { log(`'${channel.name}' trying copy ${hop + 1} of ${mirrors.length}`); setHop(hop + 1); } // the next copy, not an error screen yet
          else { log(`'${channel.name}' — no engine left`); alive = false; gaveUpOn = source0.url; setState("failed"); explain(); }
        },
      );
    }, ZAP_SETTLE_MS);

    return () => {
      alive = false;
      clearTimeout(start);
      clearTimeout(stall);
      clearTimeout(alarm);
      unwatch?.();
      trackSource.current = null;
      playingEngine.current = null;
      gaveUpOn = null;
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("playing", onPlaying);
      ladder.stop();
      releaseVideo(el);
    };
  }, [source0.url, attempt, o.engine, o.bufferSeconds, o.openTimeoutMs, o.autoRestart, o.liveBehindSeconds, o.maxHeight, o.tuneBudgetMs]);

  // A new channel starts with a fresh allowance of restarts.
  useEffect(() => { restarts.current = 0; setHop(0); }, [channel.url]);

  const retry = useCallback(() => { restarts.current = 0; tune.current = null; setHop(0); setAttempt((n) => n + 1); }, []);
  const togglePause = useCallback(() => {
    const el = video.current;
    if (!el) return;
    if (el.paused) { void el.play().catch(() => undefined); setPaused(false); } else { el.pause(); setPaused(true); }
  }, []);

  // A pick in the dialog: applied now, and remembered for this item by its language (Android rememberAudioLang).
  const selectAudio = useCallback((t: TrackOption) => {
    trackSource.current?.selectAudio(t.id);
    if (keyRef.current) itemPrefs.rememberAudio(keyRef.current, t.lang, t.label);
  }, []);
  const selectSubtitle = useCallback((t: TrackOption | null) => {
    trackSource.current?.selectSubtitle(t ? t.id : null);
    if (keyRef.current) itemPrefs.rememberSubtitle(keyRef.current, t ? t.lang : SUBTITLES_OFF);
  }, []);

  const facts = useCallback((): EngineFacts | null => playingEngine.current?.facts?.() ?? null, []);

  return { state, engine, paused, retry, togglePause, via: hop > 0 ? source0 : null, tracks, selectAudio, selectSubtitle, reason, facts };
}
