import { useContext, useEffect, useRef, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { focusFirst, Icon, isCompact, isMenuKey, Presence } from "@skmate/ui";
import { t } from "../i18n";
import { GuideContext } from "../state/GuideContext";
import { UiContext } from "../state/UiContext";
import { ChannelLogo } from "./ChannelLogo";
import { ChannelMenu, ChannelSchedule } from "./ChannelMenu";
import { daysText, leftLabel, timeLeftText } from "./Left";
import { StageIcon } from "./GroupIcon";
import { holdProps, holdSpent } from "./longPress";
import "./channel.css";

const isEnter = (e: KeyboardEvent) => e.key === "Enter" || e.keyCode === 13;
/** OK held this long opens the channel's menu instead of the channel. */
const LONG_MS = 600;

/** The archive in few words: "3 дн." (the word "archive" is dropped; the clock beside it says it), the unit as the language writes it. */
function archiveShort(n: number): string {
  const s = t("archiveDays", { n });
  const at = s.search(/\d/);
  return at > 0 ? s.slice(at) : s;
}

/**
 * One channel in a list. OK opens it; OK held (or a right click) opens its menu: favourite, watch, programme.
 * The Menu key opens the same menu.
 */
export function ChannelRow(props: {
  channel: Channel; index: number; favorite: boolean;
  onOpen: (c: Channel) => void; onFav: (c: Channel) => void; onFocus?: (c: Channel) => void;
  /** The channel on the screen now: marked with a play sign in the player's list. */
  playing?: boolean;
  /** "Programme" in the menu: a list with a day column beside it shows it there; without this, a sheet opens. */
  onSchedule?: (c: Channel) => void;
  /**
   * "live": Android's channel row of the channels screen (LiveStage.kt LiveStageRow, TV-box look): 92 high, the
   * number from the left, the logo plate, the name and "programme · time left", the progress bar on the focused row,
   * the blue archive tag in the top-right corner, the playing mark and the heart at the end.
   */
  variant?: "live";
  /** The channel's number in the playlist (the "live" row shows it; others show their place in the list). */
  number?: number;
  /** "live": this channel is in the preview beside the list (the blue pause mark). */
  previewing?: boolean;
  /** The channel whose programme the column shows (three columns, list squeezed to logos). */
  opened?: boolean;
  /** Watched before (2.6.0): the history mark at the row's end. */
  watched?: boolean;
}) {
  const { channel } = props;
  const { data, now } = useContext(GuideContext);
  const ui = useContext(UiContext);
  const { now: on, progress } = ui.program ? data.nowNext(channel.id, now) : { now: null, progress: 0 };

  // OK is taken on its release: a short press opens the channel, a long one (the timer fires first) the menu.
  const [layer, setLayer] = useState<null | "menu" | "schedule">(null);
  // The "live" row: drawn as focused (its progress bar, the scrolling lines) only while it has focus.
  const [lit, setLit] = useState(false);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => { if (press.current !== null) clearTimeout(press.current); press.current = null; };
  useEffect(() => cancel, []);
  const close = (refocus = true) => {
    setLayer(null);
    if (refocus) setTimeout(() => focusFirst(document, `ch-${channel.id}`), 0);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    // The remote's Menu key opens the same menu as holding OK (LiveScreen.kt:999). No colour key does anything (Android has none).
    if (isMenuKey(e)) { e.preventDefault(); cancel(); setLayer("menu"); return; }
    if (!isEnter(e)) return;
    e.preventDefault(); // no click on the press: the release decides
    if (press.current !== null || layer !== null) return; // a held key repeats
    // Held long enough: the menu, and this press is spent (its release lands in the menu, or nowhere).
    press.current = setTimeout(() => { press.current = null; setLayer("menu"); }, LONG_MS);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!isEnter(e)) return;
    const pending = press.current !== null;
    cancel();
    if (pending) props.onOpen(channel);
  };

  const layers = (
    <>
      <Presence show={layer === "menu"}>
        {(out) => (
          <ChannelMenu
            channel={channel} favorite={props.favorite} closing={out} onClose={() => close()}
            onFav={() => { props.onFav(channel); close(); }}
            onWatch={() => { close(false); props.onOpen(channel); }}
            onSchedule={() => {
              if (props.onSchedule) { close(false); props.onSchedule(channel); } else setLayer("schedule");
            }}
          />
        )}
      </Presence>
      <Presence show={layer === "schedule"}>
        {(out) => (
          <ChannelSchedule channel={channel} closing={out} onClose={() => close()} onWatch={() => { close(false); props.onOpen(channel); }} />
        )}
      </Presence>
    </>
  );

  if (props.variant === "live") {
    const left = on ? timeLeftText(on.stop, now) : "";
    // Compact: a finger cannot focus a row to light its progress bar, so every row shows it; a held finger opens the menu.
    const compact = isCompact();
    return (
      <>
        <button
          class={`st-focusable st-row lrow${props.index === 0 ? " st-row-first" : ""}${props.opened ? " opened" : ""}`} data-focus={`ch-${channel.id}`}
          {...(compact ? holdProps(() => { cancel(); setLayer("menu"); }) : {})}
          onClick={() => { if (holdSpent()) return; props.onOpen(channel); }}
          onFocus={() => { setLit(true); props.onFocus?.(channel); }}
          onBlur={() => { setLit(false); cancel(); }}
          onKeyDown={onKeyDown as unknown as (e: Event) => void}
          onKeyUp={onKeyUp as unknown as (e: Event) => void}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setLayer("menu"); }}
        >
          {ui.numbers ? <span class="lrow-num">{props.number ?? props.index + 1}</span> : null}
          <ChannelLogo channel={channel} tile />
          <span class="lrow-text">
            <Marquee class="lrow-name" text={channel.name} on={lit} />
            {on ? <Marquee class="lrow-prog" text={on.title} tail={left ? ` · ${left}` : ""} on={lit} /> : null}
            {on ? <span class="lrow-bar">{lit || compact ? <i style={{ width: `${(progress * 100).toFixed(1)}%` }} /> : null}</span> : null}
          </span>
          {props.previewing || props.favorite || props.watched ? (
            <span class="lrow-end">
              {props.watched && !props.previewing ? <span class="lrow-seen"><StageIcon name="history" size={20} /></span> : null}
              {props.previewing ? <span class="lrow-playing"><StageIcon name="pause_fill" size={30} /></span> : null}
              {props.favorite && !props.previewing ? <span class="lrow-fav"><StageIcon name="favorite_fill" size={22} /></span> : null}
            </span>
          ) : null}
          {channel.catchupDays ? <span class="st-archive corner">{daysText(channel.catchupDays)}</span> : null}
          <span class="mini-num">{props.number ?? props.index + 1}</span>
          {on ? <span class="mini-bar"><i style={{ width: `${(progress * 100).toFixed(1)}%` }} /></span> : null}
        </button>
        {layers}
      </>
    );
  }

  return (
    <>
      <button
        class="row ch" data-focus={`ch-${channel.id}`}
        {...(isCompact() ? holdProps(() => { cancel(); setLayer("menu"); }) : {})}
        onClick={() => { if (holdSpent()) return; props.onOpen(channel); }}
        onFocus={() => props.onFocus?.(channel)}
        onBlur={cancel}
        onKeyDown={onKeyDown as unknown as (e: Event) => void}
        onKeyUp={onKeyUp as unknown as (e: Event) => void}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setLayer("menu"); }}
      >
        {ui.numbers ? <span class="num">{props.index + 1}</span> : null}
        {ui.logos ? <ChannelLogo channel={channel} /> : null}
        <span class="grow two">
          <span class="nm">{channel.name}</span>
          {on ? (
            <>
              <span class="prog">{on.title}<span class="left"> · {leftLabel(on.stop, now)}</span></span>
              <span class="bar"><span class="bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} /></span>
            </>
          ) : null}
        </span>
        {/* The right edge: a sign that this channel is on the screen in the top corner, the archive under it. No category tag. */}
        {props.playing || props.favorite || channel.catchupDays ? (
          <span class="redge">
            <span class="rtop">
              {props.favorite ? <span class="star">★</span> : null}
              {props.playing ? <span class="now-mark" aria-hidden="true"><Icon name="play" size={22} /></span> : null}
            </span>
            {channel.catchupDays ? <span class="tag"><Icon name="history" size={18} />{archiveShort(channel.catchupDays)}</span> : null}
          </span>
        ) : null}
      </button>
      {layers}
    </>
  );
}

/** Android's basicMarquee speed (MarqueeDefaults.Velocity, 30 dp/s = 54 design px/s) and FocusMarquee's delays. */
const MARQUEE_PX_S = 54;
const MARQUEE_DELAY_MS = 900;

/**
 * One line of a focused row (ui/components/FocusMarquee.kt): cut with "…" at rest; while [on], a line that does not fit
 * scrolls to its end after 900 ms, the text repeated a third of the box apart, and again after each 900 ms pause.
 * Only a transform moves (the Web Animations API, Chromium 36+). [tail] is drawn in the same line at 60% (the time left).
 */
export function Marquee(p: { class: string; text: string; tail?: string; on: boolean }) {
  const box = useRef<HTMLSpanElement>(null);
  const [run, setRun] = useState<number | null>(null); // the gap between the copies, once the line is known not to fit
  useEffect(() => {
    setRun(null);
    if (!p.on) return;
    const id = setTimeout(() => {
      const el = box.current;
      if (el && el.scrollWidth > el.clientWidth + 1) setRun(Math.round(el.clientWidth / 3));
    }, MARQUEE_DELAY_MS);
    return () => clearTimeout(id);
  }, [p.on, p.text, p.tail]);
  const inner = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = inner.current;
    if (run === null || !el || typeof el.animate !== "function") return;
    const first = el.firstElementChild as HTMLElement | null;
    const d = (first?.offsetWidth ?? 0) + run;
    const move = (d / MARQUEE_PX_S) * 1000;
    const total = move + MARQUEE_DELAY_MS;
    const anim = el.animate(
      [{ transform: "translateX(0)" }, { transform: `translateX(${-d}px)`, offset: move / total }, { transform: `translateX(${-d}px)` }],
      { duration: total, iterations: Infinity, easing: "linear" },
    );
    return () => anim.cancel();
  }, [run]);
  const content = <>{p.text}{p.tail ? <span class="mq-tail">{p.tail}</span> : null}</>;
  return (
    <span class={`${p.class}${run !== null ? " mq-run" : ""}`} ref={box}>
      {run === null ? content : (
        <span class="mq-in" ref={inner}><span class="mq-copy">{content}</span><span class="mq-copy" style={{ marginLeft: `${run}px` }}>{content}</span></span>
      )}
    </span>
  );
}
