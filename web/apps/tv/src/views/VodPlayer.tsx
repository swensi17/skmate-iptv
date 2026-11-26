import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { NEXT_EPISODE_AT_END_MS, NEXT_EPISODE_CARD_MS, VOD_SEEK_STEP_S, type Channel } from "@skmate/core";
import { Button, focusFirst, isBack } from "@skmate/ui";
import { t } from "../i18n";
import { remoteKey } from "../platform";
import type { Settings } from "../state/settings";
import { usePlayback } from "../state/usePlayback";
import { AspectDialog, ClassicHud, hms, Loading, PlayerError, SleepDialog, Tool, useTick, type Aspect } from "./PlayerChrome";
import "./player.css";

/** 1:05:09 or 5:09. */
export function clockOf(ms: number): string {
  return hms(ms);
}

const SAVE_EVERY_MS = 10_000;

interface Props {
  title: string;
  subtitle?: string;
  url: string;
  headers?: Record<string, string>;
  /** Where to begin, in ms (a resumed film). */
  startMs: number;
  settings: Settings;
  /** The place reached: every 10 s, on pause and on leaving (Android's MovieViewModel). */
  onProgress: (positionMs: number, durationMs: number) => void;
  onExit: () => void;
  /** The episode after this one: its card shows 30 s before it starts, 8 s before the end (PlayerHud). */
  next?: { label: string; play: () => void } | null;
}

/**
 * A film or an episode full screen, with the Android app's classic HUD (PlayerHud.kt:919-1006): the top bar with the
 * clock, the transport capsule, the seek bar and the tools. Hidden: ◀ ▶ wind 10 s and show the bar on the seek line,
 * any other key shows it with Play focused. Shown: the arrows walk the buttons, ◀ ▶ on the seek line wind, Back
 * hides it; Back again leaves. The place is kept, and a restarted stream (a stall) goes back to it.
 */
export function VodPlayer(p: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const target = useMemo<Channel>(() => ({ id: p.url, name: p.title, url: p.url, group: "", ...(p.headers ? { headers: p.headers } : {}) }), [p.url]);
  const { state, paused, retry, togglePause } = usePlayback(video, target, {
    engine: p.settings.engine, bufferSeconds: p.settings.buffer, openTimeoutMs: p.settings.openTimeout * 1000, autoRestart: p.settings.autoRestart,
  });
  const [pos, setPos] = useState(p.startMs);
  const [dur, setDur] = useState(0);
  const [shown, setShown] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [aspect, setAspect] = useState<Aspect>(p.settings.aspect === "fill" ? "fill" : p.settings.aspect === "cover" ? "cover" : "fit");
  const [dialog, setDialog] = useState<"aspect" | "sleep" | null>(null);
  const [sleepAt, setSleepAt] = useState<number | null>(null);
  const last = useRef(p.startMs);
  const hide = useRef<ReturnType<typeof setTimeout>>();
  const now = useTick(10_000, shown);
  const report = () => { const el = video.current; if (el && Number.isFinite(el.duration)) p.onProgress(el.currentTime * 1000, el.duration * 1000); };

  const wake = () => {
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setShown(false), p.settings.osdSeconds * 1000);
  };
  const show = (focus?: string) => {
    setShown(true);
    wake();
    if (focus) setTimeout(() => focusFirst(document, focus), 16);
  };
  useEffect(() => { setDismissed(false); last.current = p.startMs; setPos(p.startMs); show("ch-play"); }, [p.url]);

  // Each time an engine has the picture (the first time, or after a restart) it goes to the place reached.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const onMeta = () => { if (last.current > 1000 && Number.isFinite(el.duration)) el.currentTime = last.current / 1000; };
    const onTime = () => {
      if (el.currentTime > 0) last.current = el.currentTime * 1000;
      setPos(el.currentTime * 1000);
      if (Number.isFinite(el.duration)) setDur(el.duration * 1000);
    };
    const onEnded = () => { report(); if (p.next) p.next.play(); else p.onExit(); };
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnded);
    const save = setInterval(report, SAVE_EVERY_MS);
    return () => { el.removeEventListener("loadedmetadata", onMeta); el.removeEventListener("timeupdate", onTime); el.removeEventListener("ended", onEnded); clearInterval(save); };
  }, [p.url, p.next]);
  useEffect(() => { if (paused) report(); }, [paused]);

  // The next episode: its card in the last 30 s before it starts, which is 8 s before this one ends.
  const left = dur > 0 ? dur - pos : Infinity;
  const card = !!p.next && !dismissed && left <= NEXT_EPISODE_AT_END_MS + NEXT_EPISODE_CARD_MS && left > 0;
  useEffect(() => { if (p.next && !dismissed && dur > 0 && left <= NEXT_EPISODE_AT_END_MS) { report(); p.next.play(); } }, [left <= NEXT_EPISODE_AT_END_MS]);
  useEffect(() => { if (card) focusFirst(document, "vod-next-now"); }, [card]);

  // Sleep timer: the end of the film, or so many minutes.
  useEffect(() => {
    if (sleepAt === null) return;
    const id = setInterval(() => { if (Date.now() >= sleepAt) { setSleepAt(null); report(); p.onExit(); } }, 5_000);
    return () => clearInterval(id);
  }, [sleepAt]);

  const seek = (by: number) => {
    const el = video.current;
    if (!el || !Number.isFinite(el.duration)) return;
    el.currentTime = Math.max(0, Math.min(el.duration - 1, el.currentTime + by));
    setPos(el.currentTime * 1000);
  };
  const leave = () => { report(); p.onExit(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const swallow = () => { e.stopPropagation(); e.preventDefault(); };
      const k = remoteKey(e);
      if (dialog) { if (isBack(e)) { swallow(); setDialog(null); } return; }
      const onCard = (document.activeElement as HTMLElement | null)?.closest(".ch-next") !== null;
      if (isBack(e)) { swallow(); if (card) setDismissed(true); else if (shown) { clearTimeout(hide.current); setShown(false); } else leave(); return; }
      if (state === "failed" || onCard) return; // the error screen and the card have their own buttons
      if (k === "rewind" || k === "forward") { swallow(); seek(k === "rewind" ? -VOD_SEEK_STEP_S : VOD_SEEK_STEP_S); show(); return; }
      if (!shown) {
        swallow();
        if (k === "left" || k === "right") { seek(k === "left" ? -VOD_SEEK_STEP_S : VOD_SEEK_STEP_S); show("ch-seek"); return; }
        if (!e.repeat) show("ch-play");
        return;
      }
      if (k === "playPause" || k === "play" || k === "pause") { swallow(); togglePause(); wake(); return; }
      const onBar = (document.activeElement as HTMLElement | null)?.dataset.focus === "ch-seek";
      if (onBar && (k === "left" || k === "right")) { swallow(); seek(k === "left" ? -VOD_SEEK_STEP_S : VOD_SEEK_STEP_S); wake(); return; }
      wake(); // the arrows between the buttons and OK on one are the page's own
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [state, card, shown, dialog, p.url, p.next]);
  useEffect(() => { if (state === "failed") { const id = setTimeout(() => focusFirst(document, "vod-retry"), 150); return () => clearTimeout(id); } return undefined; }, [state]);
  useEffect(() => () => { clearTimeout(hide.current); report(); }, []);

  const looks = aspect === "fit" ? "contain" : aspect === "fill" ? "fill" : "cover";
  const failed = state === "failed";
  const durMin = Math.round(dur / 60_000);
  return (
    <div class="player pv vod-player">
      <video ref={video} class="video pv-video" style={{ objectFit: looks }} autoplay playsInline />
      <Loading on={state === "loading"} classic />
      {shown && !failed ? (
        <ClassicHud
          closing={false} chips={durMin > 0 ? [t("tbMinutes", { n: durMin })] : []} title={p.title} subtitle={p.subtitle ?? null} live={false}
          now={now} paused={paused} onBack={leave} onPlayPause={() => { togglePause(); wake(); }}
          onRewind={() => { seek(-VOD_SEEK_STEP_S); wake(); }} onForward={() => { seek(VOD_SEEK_STEP_S); wake(); }}
          position={pos} duration={dur}
          tools={(
            <>
              <Tool id="vod-aspect" icon="aspect" label={t("tbAspect")} active={aspect !== "fit"} onClick={() => setDialog("aspect")} />
              <Tool id="vod-sleep" icon="clock" label={t("tbSleep")} active={sleepAt !== null} onClick={() => setDialog("sleep")} />
            </>
          )}
        />
      ) : null}
      {card && p.next ? (
        <div class="ch-next" role="dialog" aria-label={t("vodNextIn", { n: Math.ceil((left - NEXT_EPISODE_AT_END_MS) / 1000) })}>
          <div class="ch-next-title">{t("vodNextIn", { n: Math.max(0, Math.ceil((left - NEXT_EPISODE_AT_END_MS) / 1000)) })}</div>
          <div class="ch-next-sub">{p.next.label}</div>
          <div class="ch-next-actions">
            <Button small id="vod-next-now" icon="play" text={t("vodPlayNow")} onClick={() => { report(); p.next?.play(); }} />
            <Button small id="vod-next-cancel" text={t("confirmCancel")} onClick={() => setDismissed(true)} />
          </div>
        </div>
      ) : null}
      {failed ? <PlayerError onRetry={retry} retryId="vod-retry" /> : null}
      {dialog === "aspect" ? <AspectDialog value={aspect} onClose={() => setDialog(null)} onPick={(a) => { setAspect(a); setDialog(null); }} /> : null}
      {dialog === "sleep" ? (
        <SleepDialog leftMs={sleepAt !== null ? sleepAt - Date.now() : null} endLabel={dur > 0 ? t("tbSleepEndMovie") : null} onClose={() => setDialog(null)}
          onPick={(m) => {
            setDialog(null);
            const el = video.current;
            const toEnd = el && Number.isFinite(el.duration) ? (el.duration - el.currentTime) * 1000 : 0;
            setSleepAt(m === null ? null : m === "end" ? Date.now() + toEnd : Date.now() + m * 60_000);
          }} />
      ) : null}
    </div>
  );
}
