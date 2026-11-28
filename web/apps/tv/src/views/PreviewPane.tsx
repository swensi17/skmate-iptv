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
import { Ratings, splitRatings } from "./ProgrammeArt";
import { ChannelLogo } from "./ChannelLogo";
import { StageIcon } from "./GroupIcon";
import { detectPlatform } from "../platform";

/**
 * On a TV the preview opens only once the cursor has rested this long on one channel (on top of the list's own
 * dwell), and closes at once when the cursor moves: a TV has one hardware decoder, and a preview still opening when
 * a channel is started full screen would keep it from the player.
 */
const TV_REST_MS = detectPlatform() === "browser" ? 0 : 800;
/** Room kept above and below the focused line when the pane scrolls to it. */
const PANE_EDGE = 40;
/** The text skeleton stands while a new channel's programme is looked up (LiveStage.kt: 1500 ms). */
const TEXT_WAIT_MS = 1500;
/** Next, later and more, the whole pane scrolling (2.5.6, LiveStage.kt TV_BOX_MORE_ROWS). */
const SCHEDULE_MAX = 14;

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
  /** The programme the remote is on in the programme column: shown in place of what is on now. */
  prog?: Programme | null;
}) {
  const { channel, away, settings } = p;
  const { data, now } = useContext(GuideContext);
  const nn = channel ? data.nowNext(channel.id, now) : null;
  const pick = p.prog && channel ? p.prog : null;
  const [pickDesc, setPickDesc] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setPickDesc(pick?.desc);
    if (pick && channel) data.describe(channel.id, pick).then((d) => { if (live) setPickDesc(d); });
    return () => { live = false; };
  }, [pick?.start, channel?.id]);
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
    all[Math.max(0, Math.min(all.length - 1, at + dir))]?.focus(); // ▼ on the last line stays there
    if (dir < 0 && at === 0 && pane.current) { pane.current.scrollTop = 0; setScrolled(false); } // back up to the card
  };
  // 2.5.6: the card, the programme and its schedule scroll as one block, so going down the schedule carries the
  // picture up and the lines get the room; a soft shade at the top while it is scrolled. The page never scrolls.
  const pane = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const reveal = (e: FocusEvent) => {
    const box = pane.current;
    const el = e.target as HTMLElement;
    if (!box) return;
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    const bottom = top + el.offsetHeight;
    if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + PANE_EDGE;
    else if (top < box.scrollTop + PANE_EDGE) box.scrollTop = Math.max(0, top - PANE_EDGE);
    setScrolled(box.scrollTop > 0);
  };
  useEffect(() => { if (pane.current) pane.current.scrollTop = 0; setScrolled(false); }, [channel?.id]);

  return (
    <aside class="hp-pane" ref={pane} aria-label={t("setPreview")}>
      {scrolled ? <div class="hp-pane-fade" /> : null}
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
        {pick ? (
          <>
            <div class="hp-title">{pick.title}</div>
            <div class="hp-details">{t("homeTimeRange", { a: clock(pick.start), b: clock(pick.stop) })}</div>
            {pickDesc ? <RatedText class="hp-desc" text={pickDesc} /> : null}
          </>
        ) : null}
        {!pick && channel && !nn?.now ? (textWait ? <TextSkeleton /> : <NoGuide />) : null}
        {!pick && nn?.now ? (
          <>
            <div class="hp-title">{nn.now.title}</div>
            <div class="hp-details">{t("homeTimeRange", { a: clock(nn.now.start), b: clock(nn.now.stop) })}</div>
            <div class="hp-progress">
              <span class="st-progress"><i style={{ width: `${(nn.progress * 100).toFixed(1)}%` }} /></span>
              <span class="hp-left">{timeLeftText(nn.now.stop, now)}</span>
            </div>
            {/* The archive by day lives behind ▶: a channel that has one says so, or nobody finds it (2.6.2). */}
            {(channel?.catchupDays ?? 0) > 0 ? <div class="hp-hint">{t("homeArchiveDays")}</div> : null}
            {nn.now.desc ? <RatedText class="hp-desc" text={nn.now.desc} /> : null}
          </>
        ) : null}
        {channel && upcoming.length > 0 ? (
          <div class="hp-sched" onKeyDown={onSchedKey as unknown as (e: Event) => void} onFocusIn={reveal as unknown as (e: Event) => void}>
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

/** A channel with no programme guide: a short note, then three quiet bars where the programme would be (home and the player panel). */
export function NoGuide() {
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

/** A description with its ratings taken out of the text and shown under it, coloured (Кинопоиск 5,7). */
function RatedText({ text, class: cls }: { text: string; class: string }) {
  const { rest, ratings } = splitRatings(text);
  return <div class={cls}>{rest}<Ratings list={ratings} /></div>;
}
