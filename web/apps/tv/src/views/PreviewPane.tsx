import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import type { Programme } from "@skmate/epg";
import { Icon } from "@skmate/ui";
import { t } from "../i18n";
import { Spinner } from "./Spinner";
import type { Settings } from "../state/settings";
import { usePlayback } from "../state/usePlayback";
import { GuideContext } from "../state/GuideContext";
import { clock } from "../time";
import { timeLeftText } from "./Left";
import { ChannelLogo } from "./ChannelLogo";
import { StageIcon } from "./GroupIcon";
import { detectPlatform } from "../platform";

/**
 * On a TV the preview opens only once the cursor has rested this long on one channel (on top of the list's own
 * dwell), and closes at once when the cursor moves: a TV has one hardware decoder, and a preview still opening when
 * a channel is started full screen would keep it from the player.
 */
const TV_REST_MS = detectPlatform() === "browser" ? 0 : 800;
/** The text skeleton stands while a new channel's programme is looked up (LiveStage.kt: 1500 ms). */
const TEXT_WAIT_MS = 1500;
/** Next, later, and up to six more (the TV-box look), LiveStage.kt LiveStagePane. */
const SCHEDULE_MAX = 8;

/**
 * The stage beside the channel list (Android LiveStage.kt LiveStagePane, TV-box look): the muted preview on a 16:9
 * card (radius 28) with the "ЭФИР" fact and the channel in its lower corner; under it the programme on air (42/800,
 * two lines), its time, progress and time left, the synopsis, then next and later as a short list (▶ from the list
 * enters it, ◀ goes back, OK opens the programme).
 *
 * [channel] is the channel the cursor has rested on (the list's dwell); [away] says the cursor has moved to another
 * row since: the picture plays only while it has not (the TV's single decoder, see TV_REST_MS).
 */
export function PreviewPane(p: {
  channel: Channel | null; away: boolean; settings: Settings;
  /** The channel's number as the list shows it. */
  number?: number;
  /** ◀ from the schedule: back to the channel's row. */
  onBack?: () => void;
  /** OK on a programme of the schedule. */
  onProgramme?: (c: Channel, programme: Programme) => void;
}) {
  const { channel, away, settings } = p;
  const { data, now } = useContext(GuideContext);
  const nn = channel ? data.nowNext(channel.id, now) : null;
  // The stream of the preview: only for the channel the cursor is still on, after the rest; any move releases it.
  const [rested, setRested] = useState<string | null>(null);
  useEffect(() => {
    setRested(null);
    if (!channel) return;
    if (TV_REST_MS === 0) { setRested(channel.url); return; }
    const id = setTimeout(() => setRested(channel.url), TV_REST_MS);
    return () => clearTimeout(id);
  }, [channel?.url, away]);
  const live = channel && rested === channel.url && !away ? channel : null;
  // Bars stand in for the programme for a moment after the channel changes; then "no guide" if there is none.
  const [textWait, setTextWait] = useState(true);
  useEffect(() => {
    setTextWait(true);
    const id = setTimeout(() => setTextWait(false), TEXT_WAIT_MS);
    return () => clearTimeout(id);
  }, [channel?.id]);
  const upcoming = useMemo(() => {
    if (!channel) return [];
    return data.of(channel.id).filter((x) => x.start > now).sort((a, b) => a.start - b.start).slice(0, SCHEDULE_MAX);
  }, [channel?.id, data, Math.floor(now / 60_000)]);
  const onSchedKey = (e: KeyboardEvent) => {
    const dir = e.key === "ArrowUp" || e.keyCode === 38 ? -1 : e.key === "ArrowDown" || e.keyCode === 40 ? 1 : 0;
    if (e.key === "ArrowLeft" || e.keyCode === 37) { e.preventDefault(); e.stopPropagation(); p.onBack?.(); return; }
    if (e.key === "ArrowRight" || e.keyCode === 39) { e.preventDefault(); e.stopPropagation(); return; }
    if (dir === 0) return;
    e.preventDefault(); e.stopPropagation();
    const all = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-focus]"));
    const at = all.indexOf(document.activeElement as HTMLElement);
    all[Math.max(0, Math.min(all.length - 1, at + dir))]?.focus();
  };
  const sched = useRef<HTMLDivElement>(null);
  // The schedule is a short scrolling column (max 240): the focused line is brought into it, the page never scrolls.
  const reveal = (e: FocusEvent) => {
    const box = sched.current;
    const el = e.target as HTMLElement;
    if (!box) return;
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight;
  };

  return (
    <aside class="hp-pane" aria-label={t("setPreview")}>
      <div class={`hp-card${channel ? "" : " empty"}`}>
        {channel ? (
          <>
            <span class="hp-logo"><ChannelLogo channel={channel} tile /></span>
            {live && settings.preview ? <PreviewVideo key={live.url} channel={live} settings={settings} stage /> : null}
            <div class="hp-shade" />
            <div class="hp-facts"><span class="hp-fact">{t("homeLive")}</span></div>
            <div class="hp-chan">
              <ChannelLogo channel={channel} tile />
              <div class="hp-chan-text">
                {p.number !== undefined ? <div class="hp-chan-num">{p.number}</div> : null}
                <div class="hp-chan-name">{channel.name}</div>
              </div>
            </div>
          </>
        ) : (
          <div class="hp-pick">
            <StageIcon name="play_circle" size={44} />
            <div class="hp-pick-text">{t("homePickChannel")}</div>
          </div>
        )}
        <div class="hp-ring" />
      </div>
      <div class="hp-info">
        {channel && !nn?.now ? (textWait ? <TextSkeleton /> : <NoGuide />) : null}
        {nn?.now ? (
          <>
            <div class="hp-title">{nn.now.title}</div>
            <div class="hp-details">{t("homeTimeRange", { a: clock(nn.now.start), b: clock(nn.now.stop) })}</div>
            <div class="hp-progress">
              <span class="st-progress"><i style={{ width: `${(nn.progress * 100).toFixed(1)}%` }} /></span>
              <span class="hp-left">{timeLeftText(nn.now.stop, now)}</span>
            </div>
            {nn.now.desc ? <div class="hp-desc">{nn.now.desc}</div> : null}
          </>
        ) : null}
        {channel && upcoming.length > 0 ? (
          <div class="hp-sched" ref={sched} onKeyDown={onSchedKey as unknown as (e: Event) => void} onFocusIn={reveal as unknown as (e: Event) => void}>
            {upcoming.map((x, i) => (
              <button key={x.start} class={`st-focusable hp-sched-item${i === 0 ? " next" : ""}`} data-focus={`sched-${i}`}
                onClick={() => p.onProgramme?.(channel, x)}>
                <b>{clock(x.start)}</b>{"  "}{x.title}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/** Bars standing in for the programme's title, time and synopsis while they load (still: a weak TV draws no pulse). */
function TextSkeleton() {
  return (
    <div class="hp-skel" aria-hidden="true">
      <i style={{ width: "70%", height: "40px", borderRadius: "10px" }} />
      <i style={{ width: "25%", height: "16px", borderRadius: "8px" }} />
      <i style={{ width: "100%", height: "6px", borderRadius: "3px" }} />
      <i style={{ width: "95%", height: "14px", borderRadius: "7px" }} />
      <i style={{ width: "80%", height: "14px", borderRadius: "7px" }} />
    </div>
  );
}

/** A channel with no programme guide: a short note, then three quiet bars where the programme would be. */
function NoGuide() {
  return (
    <div class="hp-skel none">
      <div class="hp-noguide">{t("homeNoGuide")}</div>
      <i style={{ width: "45%", height: "16px", borderRadius: "8px" }} />
      <i style={{ width: "100%", height: "14px", borderRadius: "7px" }} />
      <i style={{ width: "75%", height: "14px", borderRadius: "7px" }} />
    </div>
  );
}

/**
 * The preview's picture. [stage]: Android's look on the channels screen: a dark card while the channel opens (the
 * spinner over it), the picture fading in once it plays.
 */
export function PreviewVideo({ channel, settings, stage }: { channel: Channel; settings: Settings; stage?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const { state } = usePlayback(video, channel, {
    engine: settings.engine, bufferSeconds: 10, openTimeoutMs: settings.openTimeout * 1000, autoRestart: false,
  });
  // Settings › Preview sound (Android livePreviewAudio): the preview is heard; turning it off mutes the one playing now.
  // A desktop browser refuses sound before the first key press (the stream would hang for the engine's whole
  // timeout): until then it stays muted. A TV has no such rule and no `userActivation` (Chromium 63).
  const activation = typeof navigator !== "undefined" ? (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation : undefined;
  const muted = !settings.previewAudio || (activation !== undefined && !activation.hasBeenActive);
  useEffect(() => { if (video.current) video.current.muted = muted; }, [muted]);
  if (stage) {
    return (
      <>
        {state !== "failed" ? <div class={`hp-skeleton${state === "playing" ? " gone" : ""}`} /> : null}
        <video ref={video} class={`pv hp-video${state === "playing" ? " on" : ""}`} muted={muted} autoplay playsInline style={{ objectFit: "cover" }} />
        {state === "loading" ? <Spinner class="hp-spin on" /> : null}
      </>
    );
  }
  return (
    <>
      <video ref={video} class="pv" muted={muted} autoplay playsInline style={{ objectFit: "cover" }} />
      {state === "loading" ? <Spinner class="small" /> : null}
      {state === "failed" ? <div class="preview-empty"><Icon name="warning" size={56} /></div> : null}
    </>
  );
}
