import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon, Option, Popup, type IconName } from "@skmate/ui";
import { t } from "../i18n";
import { clock } from "../time";
import { Spinner } from "./Spinner";
import "./player.css";

/*
 * Pieces shared by the live player and the film player, ported from the Android TV app:
 * the classic HUD (PlayerHudChrome.kt / PlayerHudControls.kt: top bar, clock, transport, dock with the seek bar and
 * the tools), the error screen (PlayerHud.kt:1041-1121 + ErrorIllustration.kt), the spinner and pause mark, the
 * 3-2-1 ring, and the Aspect / Sleep timer dialogs (PlayerHudDialogs.kt). Classes are in player.css.
 */

/** 1:05:09 or 5:09 (Android formatTimestamp). */
export function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "13:42:10": the landing moment of a seek run, to the second. */
export function clockSec(ms: number): string {
  const d = new Date(ms);
  return `${clock(ms)}:${String(d.getSeconds()).padStart(2, "0")}`;
}

/** "−1:20", "+0:30": minus (U+2212) is back in time (TvBoxPlayerInfo.kt signedDuration). */
export function signed(sec: number): string {
  return `${sec < 0 ? "−" : "+"}${hms(Math.abs(sec) * 1000)}`;
}

/** A clock that ticks every [ms] while [on]; the current time otherwise frozen at the last tick. */
export function useTick(ms: number, on = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, on]);
  return now;
}

/** "FHD", "HD", "4K" from the picture's own height: the one stream fact a browser can read (Android's chips). */
export function resolutionChip(height: number): string | null {
  if (height >= 2000) return "4K";
  if (height >= 1000) return "FHD";
  if (height >= 700) return "HD";
  if (height > 0) return "SD";
  return null;
}

/** Opening: the quiet white spinner (TV-box) or the classic one, and after 10 s of a stall the reconnect line. */
export function Loading(p: { on: boolean; classic?: boolean; stalled?: boolean }) {
  if (!p.on) return null;
  return (
    <div class={`pv-loading${p.classic ? " classic" : ""}`}>
      <Spinner class="on" label={t("playerLoading")} />
      {p.stalled ? <div class="pv-reconnect">{t("tbReconnecting")}</div> : null}
    </div>
  );
}

export function PauseMark() {
  return <div class="pv-paused" aria-label={t("playerPaused")}><Icon name="pause" size={79} /></div>;
}

export function RecBadge() {
  return <div class="pv-rec" role="status"><span />{t("recBadge")}</div>;
}

/** ErrorIllustration.kt, drawn the same way on a 100-unit grid: a dead signal, or a cloud struck through. */
export function ErrorArt(p: { kind: "signal" | "internet" }) {
  const ink = "#e8edf3", soft = "#2a3341", accent = "#4fc3f7", warn = "#ffb454";
  return (
    <svg class="pv-error-art" viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke-linecap="round">
      {p.kind === "signal" ? (
        <>
          <path d="M50 22 L34 6 M50 22 L66 6" stroke={ink} stroke-width="4" />
          <rect x="8" y="22" width="84" height="62" rx="12" fill={soft} stroke={ink} stroke-width="4" />
          <circle cx="50" cy="66" r="3.5" fill={accent} />
          {[[12, 0.95], [21, 0.6], [30, 0.3]].map(([r, a]) => {
            const d = (r as number) * Math.SQRT1_2;
            return <path key={r} d={`M${50 - d} ${66 - d} A${r} ${r} 0 0 1 ${50 + d} ${66 - d}`} stroke={accent} stroke-opacity={a} stroke-width="3.4" />;
          })}
          <path d="M26 36 L74 76" stroke={warn} stroke-width="5" />
          <path d="M36 92 L64 92" stroke={ink} stroke-width="4" />
        </>
      ) : (
        <>
          <circle cx="36" cy="56" r="17" fill={soft} /><circle cx="56" cy="46" r="22" fill={soft} /><circle cx="74" cy="58" r="16" fill={soft} />
          <rect x="22" y="56" width="66" height="20" rx="10" fill={soft} />
          <path d="M23 66 A17 17 0 0 1 30 41 M38 34 A22 22 0 0 1 76 40 M77 46 A16 16 0 0 1 84 69" stroke={ink} stroke-width="4" />
          <path d="M30 76 L80 76" stroke={ink} stroke-width="4" />
          <path d="M22 18 L82 86" stroke={warn} stroke-width="5" />
        </>
      )}
    </svg>
  );
}

/** The error screen: picture, headline, one line of why, Retry. [quiet]: behind an open panel, only the faded mark. */
export function PlayerError(p: { quiet?: boolean; onRetry: () => void; retryId: string }) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const kind = offline ? "internet" : "signal";
  if (p.quiet) return <div class="pv-error quiet"><ErrorArt kind={kind} /></div>;
  return (
    <div class="pv-error" data-modal>
      <div class="pv-error-col">
        <ErrorArt kind={kind} />
        <div class="pv-error-title">{t(offline ? "tbErrInternet" : "tbErrSignal")}</div>
        <div class="pv-error-text">{t("tbErrChannel")}</div>
        <button class="pv-error-btn" data-focus={p.retryId} onClick={p.onRetry}>{t("tbRetry")}</button>
      </div>
    </div>
  );
}

/** The 3-2-1 ring (CountdownRing.kt): the arc fills over the whole count, by the wall clock. */
export function CountdownRing(p: { n: number; totalMs: number; startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let id = 0;
    const step = () => { setNow(Date.now()); id = requestAnimationFrame(step); };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [p.startedAt]);
  const f = Math.max(0, Math.min(1, (now - p.startedAt) / p.totalMs));
  const r = 14.75, c = 2 * Math.PI * r;
  return (
    <span class="tp-ring" aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <circle cx="16" cy="16" r={r} fill="none" stroke="rgba(0,134,252,.2)" stroke-width="2.5" />
        <circle cx="16" cy="16" r={r} fill="none" stroke="#0086fc" stroke-width="2.5" stroke-linecap="round" stroke-dasharray={`${c * f} ${c}`} />
      </svg>
      <b>{p.n}</b>
    </span>
  );
}

/** The dwell rule (DwellCountdown.kt): rest [quietMs] on [key], then 3, 2, 1 a second apart, then [onFire]. */
export function useDwell(key: string | null, armed: boolean, quietMs: number, onFire: () => void): { n: number; startedAt: number } {
  const [n, setN] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const fire = useRef(onFire);
  fire.current = onFire;
  useEffect(() => {
    setN(0);
    if (!armed || key === null) return;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    timers.push(setTimeout(() => {
      setStartedAt(Date.now());
      setN(3);
      timers.push(setTimeout(() => setN(2), 1000));
      timers.push(setTimeout(() => setN(1), 2000));
      timers.push(setTimeout(() => { setN(0); fire.current(); }, 3000));
    }, quietMs));
    return () => timers.forEach(clearTimeout);
  }, [key, armed]);
  return { n, startedAt };
}

/* ---------- Classic HUD ---------- */

export function Circle(p: { id: string; icon: IconName; size: 40 | 44 | 64; primary?: boolean; onClick: () => void; label: string }) {
  return (
    <button class={`ch-circle s${p.size}${p.primary ? " primary" : ""}`} data-focus={p.id} onClick={p.onClick} aria-label={p.label}>
      <Icon name={p.icon} size={Math.round(p.size * 1.8 * 0.42)} />
    </button>
  );
}

export function Tool(p: { id: string; icon: IconName; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button class={`ch-tool${p.active ? " active" : ""}`} data-focus={p.id} onClick={p.onClick} aria-pressed={p.active}>
      <span class="ch-tool-glyph"><Icon name={p.icon} size={47} /></span>
      <span class="ch-tool-label">{p.label}</span>
    </button>
  );
}

/** PlayerClock.kt: the real time, and while a recording plays the moment being watched first, in the accent. */
export function HudClock(p: { now: number; watching?: number | null }) {
  const date = (ms: number) => new Date(ms).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  return (
    <div class="ch-clock">
      {p.watching ? (
        <div class="ch-clock-col archive">
          <div class="ch-clock-label">{t("tbClockProgramme")}</div>
          <div class="ch-clock-time">{clock(p.watching)}</div>
          <div class="ch-clock-date">{date(p.watching)}</div>
        </div>
      ) : null}
      <div class="ch-clock-col">
        <div class="ch-clock-label">{t("tbClockCurrent")}</div>
        <div class="ch-clock-time">{clock(p.now)}</div>
        <div class="ch-clock-date">{date(p.now)}</div>
      </div>
    </div>
  );
}

/** The film / recording seek bar with its time caps (VodTimeline + SeekBar): ◀ ▶ on it move by [stepS]. */
export function SeekBar(p: { position: number; duration: number }) {
  const f = p.duration > 0 ? Math.max(0, Math.min(1, p.position / p.duration)) : 0;
  const pct = `${(f * 100).toFixed(2)}%`;
  return (
    <div class="ch-band-a">
      <span class="ch-cap">{hms(p.position)}</span>
      <button class="ch-seek" data-focus="ch-seek" aria-label={hms(p.position)}>
        <span class="ch-seek-track"><i style={{ width: pct }} /></span>
        <span class="ch-head" style={{ left: pct }}><i /></span>
        <span class="ch-bubble" style={{ left: pct, transform: "translateX(-50%)" }}>{t("tbTimeRemaining", { t: hms(p.duration - p.position) })}</span>
      </button>
      <span class="ch-cap end">{t("tbTimeRemaining", { t: hms(Math.max(0, p.duration - p.position)) })}</span>
    </div>
  );
}

/**
 * The classic HUD over a recording or a film: both scrims, the top bar (back, logo, chips, title; the clock in the
 * middle; [epg] at the right), the transport capsule and the dock ([media] tools at the left edge, [tools] at the
 * right). [closing] fades it out.
 */
export function ClassicHud(p: {
  closing: boolean;
  logo?: ComponentChildren;
  chips: string[];
  number?: string | null;
  title: string;
  subtitle?: string | null;
  live: boolean;
  now: number;
  watching?: number | null;
  epg?: ComponentChildren;
  paused: boolean;
  onBack: () => void;
  onPlayPause: () => void;
  onRewind: () => void;
  onForward: () => void;
  position: number;
  duration: number;
  media?: ComponentChildren;
  tools?: ComponentChildren;
}) {
  const chips = p.chips.length > 0 ? (
    <div class="ch-chips">{p.chips.map((c, i) => <span key={c}>{i > 0 ? <i /> : null}{c}</span>)}</div>
  ) : null;
  return (
    <div class={`ch-hud${p.closing ? " out" : ""}`}>
      <div class="ch-top-shade" />
      <div class="ch-bottom-shade" />
      <div class="ch-top">
        <div class="ch-half">
          <Circle id="ch-back" icon="back" size={40} onClick={p.onBack} label={t("playerBack")} />
          {p.logo ? <div class="ch-logo">{p.logo}</div> : null}
          <div class="ch-titles">
            {p.live ? chips : p.subtitle ? <div class="ch-sub">{p.subtitle}</div> : null}
            <div class="ch-title">{p.number ? <span class="ch-num">{p.number}</span> : null}{p.title}</div>
            {p.live ? null : chips}
          </div>
        </div>
        <HudClock now={p.now} watching={p.watching ?? null} />
        <div class="ch-half end">{p.epg}</div>
      </div>
      <div class="ch-transport">
        <div class="ch-capsule">
          <Circle id="ch-rew" icon="rewind" size={44} onClick={p.onRewind} label={t("playerBack30")} />
          <Circle id="ch-play" icon={p.paused ? "play" : "pause"} size={64} primary onClick={p.onPlayPause} label={t(p.paused ? "playerPlay" : "playerPause")} />
          <Circle id="ch-fwd" icon="fast_forward" size={44} onClick={p.onForward} label={t("playerFwd30")} />
        </div>
      </div>
      <div class="ch-dock">
        {p.duration > 0 ? <SeekBar position={p.position} duration={p.duration} /> : null}
        <div class="ch-band-b">
          <div class="ch-cluster">{p.media}</div>
          <div class="ch-spacer" />
          <div class="ch-cluster">{p.tools}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Dialogs (PlayerHudDialogs.kt): a 640-wide StagePopup list, a check on the chosen row ---------- */

export type Aspect = "fit" | "fill" | "cover";

/** Zoom: the three object-fit modes a browser has (Android also offers 1:1, 16:9 and 4:3). */
export function AspectDialog(p: { value: Aspect; onPick: (a: Aspect) => void; onClose: () => void }) {
  const rows: Array<[Aspect, string]> = [["fit", t("tbZoomFit")], ["cover", t("tbZoomFill")], ["fill", t("tbZoomStretch")]];
  useEffect(() => { setTimeout(() => (document.querySelector<HTMLElement>(`[data-focus="za-${p.value}"]`))?.focus(), 30); }, []);
  return (
    <Popup title={t("tbZoom")} width={640} onClose={p.onClose}>
      {rows.map(([v, label]) => <Option key={v} id={`za-${v}`} title={label} checked={v === p.value} onClick={() => p.onPick(v)} />)}
    </Popup>
  );
}

export const SLEEP_MINUTES = [15, 30, 45, 60, 90];

/** Sleep timer: off (while one runs), 15–90 minutes, the end of the programme (or film) when it is known. */
export function SleepDialog(p: { leftMs: number | null; endLabel?: string | null; onPick: (minutes: number | "end" | null) => void; onClose: () => void }) {
  useEffect(() => { setTimeout(() => (document.querySelector<HTMLElement>("[data-focus^=\"sl-\"]"))?.focus(), 30); }, []);
  const title = p.leftMs !== null ? t("tbSleepLeft", { t: t("tbMinutes", { n: Math.max(1, Math.ceil(p.leftMs / 60_000)) }) }) : t("tbSleep");
  return (
    <Popup title={title} width={640} onClose={p.onClose}>
      {p.leftMs !== null ? <Option id="sl-off" title={t("tbOff")} onClick={() => p.onPick(null)} /> : null}
      {SLEEP_MINUTES.map((m) => <Option key={m} id={`sl-${m}`} title={t("tbMinutes", { n: m })} onClick={() => p.onPick(m)} />)}
      {p.endLabel ? <Option id="sl-end" title={p.endLabel} onClick={() => p.onPick("end")} /> : null}
    </Popup>
  );
}
