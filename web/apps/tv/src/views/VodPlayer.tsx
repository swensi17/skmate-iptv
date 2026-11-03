import { Spinner } from "./Spinner";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { NEXT_EPISODE_AT_END_MS, NEXT_EPISODE_CARD_MS, VOD_SEEK_STEP_S, type Channel } from "@skmate/core";
import { focusFirst, Icon, isBack } from "@skmate/ui";
import { t } from "../i18n";
import type { Settings } from "../state/settings";
import { usePlayback } from "../state/usePlayback";

/** 1:05:09 or 5:09. */
export function clockOf(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
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
 * A film or an episode full screen. OK pauses, Left and Right wind 10 s, Up or Down show where it is, Back leaves.
 * The place is kept, and a restarted stream (a stall) goes back to it instead of the beginning.
 */
export function VodPlayer(p: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const target = useMemo<Channel>(() => ({ id: p.url, name: p.title, url: p.url, group: "", ...(p.headers ? { headers: p.headers } : {}) }), [p.url]);
  const { state, paused, retry, togglePause } = usePlayback(video, target, {
    engine: p.settings.engine, bufferSeconds: p.settings.buffer, openTimeoutMs: p.settings.openTimeout * 1000, autoRestart: p.settings.autoRestart,
  });
  const [pos, setPos] = useState(p.startMs);
  const [dur, setDur] = useState(0);
  const [bar, setBar] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const last = useRef(p.startMs);
  const hide = useRef<ReturnType<typeof setTimeout>>();
  const report = () => { const el = video.current; if (el && Number.isFinite(el.duration)) p.onProgress(el.currentTime * 1000, el.duration * 1000); };

  const show = () => {
    setBar(true);
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setBar(false), p.settings.osdSeconds * 1000);
  };
  useEffect(() => { setDismissed(false); last.current = p.startMs; setPos(p.startMs); show(); }, [p.url]);

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
  useEffect(() => { if (paused) { report(); setBar(true); clearTimeout(hide.current); } else show(); }, [paused]);

  // The next episode: its card in the last 30 s before it starts, which is 8 s before this one ends.
  const left = dur > 0 ? dur - pos : Infinity;
  const card = !!p.next && !dismissed && left <= NEXT_EPISODE_AT_END_MS + NEXT_EPISODE_CARD_MS && left > 0;
  useEffect(() => { if (p.next && !dismissed && dur > 0 && left <= NEXT_EPISODE_AT_END_MS) { report(); p.next.play(); } }, [left <= NEXT_EPISODE_AT_END_MS]);
  useEffect(() => { if (card) focusFirst(document, "vod-next-now"); }, [card]);

  const seek = (by: number) => {
    const el = video.current;
    if (!el || !Number.isFinite(el.duration)) return;
    el.currentTime = Math.max(0, Math.min(el.duration - 1, el.currentTime + by));
    setPos(el.currentTime * 1000);
    show();
  };
  const leave = () => { report(); p.onExit(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const onCard = (document.activeElement as HTMLElement | null)?.closest(".vod-next") !== null;
      const swallow = () => { e.stopPropagation(); e.preventDefault(); };
      if (isBack(e)) { swallow(); if (card) setDismissed(true); else leave(); return; }
      if (state === "failed" || onCard) return; // the error screen and the card have their own buttons
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { swallow(); seek(e.key === "ArrowLeft" ? -VOD_SEEK_STEP_S : VOD_SEEK_STEP_S); return; }
      if (e.key === "Enter" || e.keyCode === 13 || e.keyCode === 415 || e.keyCode === 19) { swallow(); togglePause(); show(); return; }
      swallow();
      show();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [state, card, p.url, p.next]);
  useEffect(() => { if (state === "failed") focusFirst(document, "vod-retry"); }, [state]);
  useEffect(() => () => { clearTimeout(hide.current); report(); }, []);

  const fraction = dur > 0 ? Math.min(1, pos / dur) : 0;
  return (
    <div class={`player vod-player${bar || paused ? " info" : ""}`}>
      <video ref={video} class="video" style={{ objectFit: "contain" }} autoplay playsInline />
      <div class="player-shade" />
      <Spinner class={state === "loading" ? "on" : ""} label={t("playerLoading")} />
      {paused ? <div class="paused" aria-label={t("playerPaused")}><Icon name="pause" size={96} /></div> : null}
      <div class="vod-bar">
        <div class="vod-title">{p.title}</div>
        {p.subtitle ? <div class="vod-sub">{p.subtitle}</div> : null}
        <div class="vod-line">
          <span>{clockOf(pos)}</span>
          <span class="vod-track"><span style={{ width: `${Math.round(fraction * 100)}%` }} /></span>
          <span>{dur > 0 ? clockOf(dur) : "–:––"}</span>
        </div>
      </div>
      {card && p.next ? (
        <div class="vod-next" role="dialog" aria-label={t("vodNextIn", { n: Math.ceil((left - NEXT_EPISODE_AT_END_MS) / 1000) })}>
          <div class="vod-next-title">{t("vodNextIn", { n: Math.max(0, Math.ceil((left - NEXT_EPISODE_AT_END_MS) / 1000)) })}</div>
          <div class="vod-sub">{p.next.label}</div>
          <div class="empty-actions">
            <button class="btn" data-focus="vod-next-now" onClick={() => { report(); p.next?.play(); }}>{t("vodPlayNow")}</button>
            <button class="btn" data-focus="vod-next-cancel" onClick={() => setDismissed(true)}>{t("confirmCancel")}</button>
          </div>
        </div>
      ) : null}
      {state === "failed" ? (
        <div class="player-error" data-modal>
          <Icon name="warning" size={96} />
          <div class="player-error-title">{t("playerFailed")}</div>
          <div class="player-note">{t("playerFailedHint")}</div>
          <div class="empty-actions">
            <button class="btn" data-focus="vod-retry" onClick={retry}>{t("playerRetry")}</button>
            <button class="btn" data-focus="vod-back" onClick={leave}>{t("playerBack")}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
