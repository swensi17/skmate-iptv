import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ZOOM_MODES, zoomLook, zoomTransform, type FailureReason, type TrackOption, type ZoomMode } from "@skmate/player";
import { Icon, Option, Popup, type IconName } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { clock } from "../time";
import { SET_ICONS } from "./settingsIcons";
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
/** The reason's sentence (Android PlayerFailureReason.messageRes). */
const REASON_TEXT: Record<FailureReason, Key> = {
  http509: "plReason509", oneSession: "plReasonOneSession", http403: "plReason403", http401: "plReason401", http404: "plReason404",
  http400: "plReason400", ssl: "plReasonSsl", format: "plReasonFormat", network: "plReasonNetwork",
};

export function PlayerError(p: { quiet?: boolean; onRetry: () => void; retryId: string; reason?: FailureReason | null; frame?: { x: number; y: number; w: number; h: number } | null }) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const kind = offline ? "internet" : "signal";
  // 2.5.8: behind the channel panel the failure stands in the middle of the picture's window, its mark and headline.
  if (p.quiet) {
    const at = p.frame ? { left: `${p.frame.x}px`, top: `${p.frame.y}px`, width: `${p.frame.w}px`, height: `${p.frame.h}px` } : undefined;
    return (
      <div class="pv-error quiet">
        <div class={`pv-error-frame${at ? " framed" : ""}`} style={at}>
          <ErrorArt kind={kind} />
          <div class="pv-error-quiet-title">{t(offline ? "tbErrInternet" : "tbErrSignal")}</div>
        </div>
      </div>
    );
  }
  return (
    <div class="pv-error" data-modal>
      <div class="pv-error-col">
        <ErrorArt kind={kind} />
        <div class="pv-error-title">{t(offline ? "tbErrInternet" : "tbErrSignal")}</div>
        <div class="pv-error-text">{t("tbErrChannel")}</div>
        {/* 2.5.2: once the reason is known (a 404, a 403, no answer), it says so under the failure. */}
        {p.reason && !offline ? <div class="pv-error-reason">{t(REASON_TEXT[p.reason])}</div> : null}
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

/** A dock tool. [glyph] stands in for the icon (the track glyphs); [badge]: the count circle at its top-end (ToolTile). */
export function Tool(p: { id: string; icon: IconName; label: string; active?: boolean; onClick: () => void; glyph?: ComponentChildren; badge?: number | null }) {
  return (
    <button class={`ch-tool${p.active ? " active" : ""}`} data-focus={p.id} onClick={p.onClick} aria-pressed={p.active}>
      <span class="ch-tool-glyph">{p.glyph ?? <Icon name={p.icon} size={47} />}{p.badge ? <span class="ch-tool-badge">{p.badge}</span> : null}</span>
      <span class="ch-tool-label">{p.label}</span>
    </button>
  );
}

/** OwnTVIcon.AUDIO and SUBTITLE (Phosphor, the paths the settings rows draw too): not in the shared icon set. */
export function TrackGlyph(p: { kind: "audio" | "subtitle"; size: number }) {
  const g = SET_ICONS[p.kind === "audio" ? "AUDIO" : "SUBTITLE"] as [number, string];
  return (
    <svg viewBox={`0 0 ${g[0]} ${g[0]}`} width={p.size} height={p.size} fill="currentColor" aria-hidden="true"><path d={g[1]} /></svg>
  );
}

/**
 * PlayerCornerClock.kt (Settings › player clock and its look): the time top-right over the whole picture, ticking on
 * the minute. Sizes 20/26/36, weight 500/700, background none (a soft shadow) / black / white (dark digits) / SkMate
 * blue at 0/25/50/75 % transparency, hanging from the top edge; digits white / #FFD54F / #8CC8FF.
 */
export function CornerClock(p: { size: number; weight: number; bg: number; color: number; alpha: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const step = () => { setNow(Date.now()); id = setTimeout(step, 60_000 - (Date.now() % 60_000)); };
    id = setTimeout(step, 60_000 - (Date.now() % 60_000));
    return () => clearTimeout(id);
  }, []);
  const bg = p.bg >= 0 && p.bg <= 3 ? p.bg : 1;
  const opaque = 1 - ([0, 25, 50, 75][p.alpha] ?? 25) / 100;
  const fill = bg === 0 ? null : bg === 2 ? `rgba(255, 255, 255, ${opaque})` : bg === 3 ? `rgba(0, 134, 252, ${opaque})` : `rgba(0, 0, 0, ${opaque})`;
  const ink = bg === 2 ? "#15181c" : (["#ffffff", "#ffd54f", "#8cc8ff"][p.color] ?? "#ffffff");
  const style = {
    fontSize: `${[20, 26, 36][p.size] ?? 26}px`, fontWeight: p.weight === 0 ? 500 : 700, color: ink,
    ...(fill ? { background: fill } : { textShadow: "0 0 8px rgba(0, 0, 0, .45)" }),
  };
  return <div class={`pv-clock${fill ? " plate" : ""}`} style={style} aria-hidden="true">{clock(now)}</div>;
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

export type Aspect = ZoomMode;

/** The six zoom modes' names (OwnTVPlayer.kt ZoomMode labels). */
const ZOOM_LABELS: Record<ZoomMode, Key> = {
  fit: "sa_player_zoom_fit_screen", crop: "sa_player_zoom_fill_crop", stretch: "sa_player_zoom_stretch",
  original: "sa_player_zoom_original", "16_9": "sa_player_zoom_force_16_9", "4_3": "sa_player_zoom_force_4_3", "2_39": "sa_player_zoom_cinema",
};

/** Zoom (PlayerHudDialogs.kt ZoomDialog): the six modes in Android's order, the current one ticked and focused. */
export function AspectDialog(p: { value: Aspect; onPick: (a: Aspect) => void; onClose: () => void }) {
  useEffect(() => { setTimeout(() => (document.querySelector<HTMLElement>(`[data-focus="za-${p.value}"]`))?.focus(), 30); }, []);
  return (
    <Popup title={t("tbZoom")} width={640} onClose={p.onClose}>
      {ZOOM_MODES.map((v) => <Option key={v} id={`za-${v}`} title={t(ZOOM_LABELS[v])} checked={v === p.value} onClick={() => p.onPick(v)} />)}
    </Popup>
  );
}

/**
 * The <video> style of a zoom mode: `object-fit` and, for Fill/Crop, 1:1 and the forced shapes, one static scale.
 * Measured only when the mode, the picture's size or the window changes (never per frame, no layout of its own).
 */
export function useZoomStyle(video: { current: HTMLVideoElement | null }, mode: ZoomMode): { objectFit: "contain" | "fill"; transform?: string } {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [win, setWin] = useState(0);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const read = () => {
      const w = el.videoWidth, h = el.videoHeight;
      setSize((cur) => (w > 0 && h > 0 ? (cur && cur.w === w && cur.h === h ? cur : { w, h }) : null));
    };
    const onWin = () => setWin((n) => n + 1);
    ["loadedmetadata", "resize", "emptied"].forEach((e) => el.addEventListener(e, read));
    window.addEventListener("resize", onWin);
    read();
    return () => { ["loadedmetadata", "resize", "emptied"].forEach((e) => el.removeEventListener(e, read)); window.removeEventListener("resize", onWin); };
  }, []);
  return useMemo(() => {
    if (mode === "fit") return { objectFit: "contain" };
    if (mode === "stretch") return { objectFit: "fill" };
    // The full-screen box is the player's own (the element may still sit in the docked corner while this runs).
    const host = video.current?.parentElement;
    if (!host) return { objectFit: "contain" };
    const box = { w: host.offsetWidth, h: host.offsetHeight };
    const devicePerCss = box.w > 0 ? (host.getBoundingClientRect().width / box.w) * (window.devicePixelRatio || 1) : 1;
    const look = zoomLook(mode, size, box, devicePerCss);
    const transform = zoomTransform(look);
    return transform === "none" ? { objectFit: look.objectFit } : { objectFit: look.objectFit, transform };
  }, [mode, size?.w, size?.h, win]);
}

/** A language's own name in the app's language where the browser can say it (Intl.DisplayNames: not on Chromium 63), else its code. */
function languageName(code: string): string {
  const c = code.trim();
  if (!c || c.toLowerCase() === "und") return "";
  const Names = (Intl as unknown as { DisplayNames?: new (l: string[], o: { type: string }) => { of(c: string): string | undefined } }).DisplayNames;
  if (Names) {
    try { const n = new Names([document.documentElement.lang || "en"], { type: "language" }).of(c); if (n && n.toLowerCase() !== c.toLowerCase()) return n.charAt(0).toUpperCase() + n.slice(1); } catch { /* not a tag it knows */ }
  }
  return c.toUpperCase();
}

/** TrackOptionText.kt displayLabel: the stream's label, else the language's name, else "Audio N" / "Subtitle N". */
export function trackLabel(x: TrackOption, kind: "audio" | "subtitle", index: number): string {
  return x.label.trim() || languageName(x.lang) || t(kind === "audio" ? "pfAudioN" : "pfSubtitleN", { n: index + 1 });
}

/**
 * Audio / Subtitles (PlayerHudDialogs.kt TrackDialog): a 640-wide list, the chosen track ticked. Subtitles begin with
 * Off. Focus starts on the chosen track, else Off, else the first. No track at all: one quiet line.
 */
export function TrackDialog(p: {
  kind: "audio" | "subtitle"; tracks: readonly TrackOption[]; onPick: (x: TrackOption | null) => void; onClose: () => void;
}) {
  const offRow = p.kind === "subtitle";
  const chosen = p.tracks.findIndex((x) => x.selected);
  useEffect(() => {
    const id = chosen >= 0 ? `tr-${chosen}` : offRow ? "tr-off" : "tr-0";
    setTimeout(() => (document.querySelector<HTMLElement>(`[data-focus="${id}"]`))?.focus(), 30);
  }, []);
  return (
    <Popup title={t(p.kind === "audio" ? "pfAudioTrack" : "pfSubtitlesTitle")} width={640} onClose={p.onClose}>
      {p.tracks.length === 0 && !offRow ? <div class="pv-no-tracks">{t("pfNoTracks")}</div> : null}
      {offRow ? <Option id="tr-off" title={t("tbOff")} checked={chosen < 0} onClick={() => p.onPick(null)} /> : null}
      {p.tracks.map((x, i) => <Option key={x.id} id={`tr-${i}`} title={trackLabel(x, p.kind, i)} checked={x.selected} onClick={() => p.onPick(x)} />)}
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
