import type { ComponentChildren } from "preact";
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Programme } from "@skmate/epg";
import { archiveUrl, hasArchive, type Channel } from "@skmate/core";
import { Icon } from "@skmate/ui";
import type { ProgrammeArt } from "../state/tmdb";
import { aboutText, ProgrammePoster } from "./ProgrammeArt";
import { t } from "../i18n";
import { GuideContext } from "../state/GuideContext";
import { capitalize } from "../text";
import { leftLabel } from "./Left";
import { ChannelLogo } from "./ChannelLogo";

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * The column beside the player's channel list: what is on the channel the cursor is on, and the day ahead of it. Right
 * from the list walks into it, Up and Down go through the programmes (the card above shows the one under the cursor),
 * Left goes back. A channel without a guide says so, over a few quiet placeholder lines.
 * OK on a programme: the one on air watches the channel, a past one plays its recording (when the channel keeps one),
 * one still to come asks about a reminder.
 */
export function Schedule({ channel, onWatch, onArchive, onUpcoming }: {
  channel: Channel | null;
  onWatch?: (c: Channel) => void;
  onArchive?: (c: Channel, p: Programme) => void;
  onUpcoming?: (c: Channel, p: Programme) => void;
}) {
  const { data, now } = useContext(GuideContext);
  const box = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<Programme | null>(null);
  const items = channel ? data.of(channel.id) : [];
  const live = items.find((x) => x.start <= now && now < x.stop) ?? null;
  const from = items.findIndex((x) => x.stop > now - 30 * 60_000);
  const shown = from < 0 ? [] : items.slice(from, from + 40);

  /** The row under the cursor stays at one place, a little above the middle, and the day moves under it. */
  const pin = (row: HTMLElement) => {
    const list = box.current;
    if (list) list.scrollTop = row.offsetTop - list.clientHeight * 0.38;
  };
  useEffect(() => { setPicked(null); }, [channel?.id]);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>(".sc-now")?.scrollIntoView({ block: "center" });
  }, [channel?.id, shown.length]);

  if (!channel) return <div class="tm-sched" />;
  const press = (x: Programme) => {
    if (x.stop <= now) { if (archiveUrl(channel, x.start, x.stop, now) !== null) onArchive?.(channel, x); }
    else if (x.start > now) onUpcoming?.(channel, x);
    else onWatch?.(channel);
  };
  const card = picked ?? live;
  return (
    <div class="tm-sched" data-ch={channel.id}>
      <div class="sc-head">
        <div class="sc-name">{channel.name}</div>
        {channel.group ? <div class="sc-group">{capitalize(channel.group)}</div> : null}
      </div>
      {shown.length === 0 ? (
        <>
          <div class="sc-none">{t("scheduleNone")}</div>
          <div class="sc-skel" aria-hidden="true">
            {Array.from({ length: 8 }, (_, k) => (
              <div class="sc-row sk" key={k} style={{ opacity: 1 - k * 0.1, animationDelay: `${k * 90}ms` }}>
                <span class="sk-at" /><span class="sk-t" style={{ width: `${70 - (k % 3) * 14}%` }} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {card ? (
            <div class="sc-card">
              <div class="sc-title">{card.title}</div>
              <div class="sc-time">{clock(card.start)} – {clock(card.stop)}{card === live ? ` · ${leftLabel(card.stop, now)}` : ""}</div>
              {card === live ? <span class="bar"><span class="bar-fill" style={{ width: `${Math.round(Math.min(1, Math.max(0, (now - card.start) / (card.stop - card.start))) * 100)}%` }} /></span> : null}
              {card.desc ? <div class="sc-desc">{card.desc}</div> : null}
            </div>
          ) : null}
          <div class="sc-list" ref={box}>
            {shown.map((x, i) => (
              <button class={`sc-row${x === live ? " sc-now" : ""}`} key={x.start} data-focus={`sc-${i}`} onFocus={(e) => { setPicked(x); pin(e.currentTarget as HTMLElement); }} onClick={() => press(x)} tabIndex={-1}>
                <span class="sc-at">{clock(x.start)}</span>
                <span class="sc-t">{x.title}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- The guide under the docked picture (TvBoxChannelPanel.kt 2.5.3–2.5.4) ---------- */

/** One line of the guide under the picture; [archive] is set on an aired programme that can be watched again. */
export interface ScheduleLine { start: number; stop: number; title: string; archive: Programme | null }

/** The archive's aired programmes kept (Android AIRED_LINES: the provider's whole depth, as far as the guide holds it). */
const AIRED_LINES = 3000;
/** What comes after what is on: a day of a channel of short programmes. */
const AHEAD_LINES = 48;

/** The archive's aired programmes, then what is on and what comes, in time order (scheduleLines). */
export function scheduleLines(channel: Channel, items: readonly Programme[], now: number): ScheduleLine[] {
  const at = items.findIndex((x) => x.stop > now);
  const entries = at < 0 ? [] : items.slice(Math.max(0, at - 1), at + AHEAD_LINES);
  const aired = items.filter((x) => x.stop <= now && archiveUrl(channel, x.start, x.stop, now) !== null).slice(-AIRED_LINES)
    .map((x): ScheduleLine => ({ start: x.start, stop: x.stop, title: x.title, archive: x }));
  const rest = entries.filter((x) => aired.length === 0 || x.stop > now).map((x): ScheduleLine => ({ start: x.start, stop: x.stop, title: x.title, archive: null }));
  const seen = new Set<number>();
  return aired.concat(rest).filter((l) => (seen.has(l.start) ? false : (seen.add(l.start), true))).sort((a, b) => a.start - b.start);
}

/** Heights of the pieces of the block (mpx): the name row, the poster row (18 above, 144 + the 3 ring each side), the gap, a line. */
export const UNDER_HEAD = 48;
export const UNDER_ART = 18 + 144 + 6;
export const UNDER_GAP = 12;
export const UNDER_LINE = 50;

/** Where [line] (counted from the first shown) starts in the block. */
export const lineTop = (art: boolean, line: number) => UNDER_HEAD + (art ? UNDER_ART : 0) + UNDER_GAP + line * UNDER_LINE;

/**
 * Android showFrom(rowsFrom + i - 1): a focused line goes to the top with one line above it (the gap above the first),
 * the name and the poster sliding away; never past the list's end. The poster brings the list back to the top.
 */
export function scrollFor(art: boolean, line: number | null, shownLines: number, viewH: number): number {
  if (line === null) return 0;
  const target = line === 0 ? lineTop(art, 0) - UNDER_GAP : lineTop(art, line - 1);
  const content = lineTop(art, shownLines);
  return Math.max(0, Math.min(target, content - viewH));
}

/** What a programme is about, as large as fills the room beside the poster (fittedAbout): 24 down to 18 mpx. */
function FittedAbout({ text }: { text: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(18);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    // A very short text keeps the usual size, where growing it would only look odd.
    if (text.length < 60) { setSize(18); return; }
    for (let sp = 24; sp >= 18; sp--) {
      el.style.fontSize = `${sp}px`;
      if (el.scrollHeight <= el.clientHeight || sp === 18) { setSize(sp); break; }
    }
  }, [text]);
  return <div class="tp-art-about" ref={box} style={{ fontSize: `${size}px` }}>{text}</div>;
}

/**
 * The block under the docked picture: the focused channel (logo, number, name), the poster and the story of a film
 * or series on air, and its guide as lines: the archive's aired programmes (the rewind mark, OK plays one from the
 * start), what is on (the bar and the minutes left; OK watches) and what comes. It only draws: the panel owns the keys
 * and says which piece is focused ([at]: the poster, or a line's index in [lines]).
 */
export function PanelGuide(p: {
  channel: Channel; number: number | null; now: number; lines: readonly ScheduleLine[] | null; first: number;
  art: ProgrammeArt | null; at: "poster" | number | null; viewH: number;
  /** The line the list was last scrolled for (it stays so while focus is back in the channels); null: the top. */
  view: number | null;
  onLine: (i: number) => void; onPoster: () => void;
}) {
  const { channel, now, lines, first, art } = p;
  const shownLines = lines ? Math.max(0, lines.length - first) : 0;
  const line = typeof p.at === "number" ? p.at - first : null;
  const scroll = scrollFor(!!art, p.view !== null ? Math.max(0, p.view - first) : null, shownLines, p.viewH);
  // Only the lines in view and a little past the focused one exist: a week of archive is never laid out at once.
  const last = Math.min(lines ? lines.length : 0, first + Math.max(18, (line ?? 0) + 14));
  const rows: ComponentChildren[] = [];
  for (let i = first; lines && i < last; i++) {
    const l = lines[i] as ScheduleLine;
    const on = l.start <= now && now < l.stop;
    const past = l.stop <= now;
    rows.push(
      <button
        key={l.start} type="button" tabIndex={-1} data-ug={i} class={`tp-l${on ? " on" : past ? " past" : ""}${p.at === i ? " foc" : ""}`}
        style={{ top: `${lineTop(!!art, i - first)}px` }} onClick={() => p.onLine(i)}
      >
        <span class="tp-l-time">{t("tbRange", { a: clock(l.start), b: clock(l.stop) })}</span>
        {l.archive ? <Icon name="rewind" size={18} /> : null}
        <span class="tp-l-title">{l.title}</span>
        {on ? <span class="tp-l-bar"><i style={{ width: `${Math.round(Math.min(1, Math.max(0, (now - l.start) / Math.max(1, l.stop - l.start))) * 100)}%` }} /></span> : null}
        {on ? <span class="tp-l-left">{t("tbTimeLeft", { t: t("tbMinutes", { n: Math.max(0, Math.floor((l.stop - now) / 60_000)) }) })}</span> : null}
      </button>,
    );
  }
  return (
    <div class="tp-under-clip" style={{ height: `${p.viewH}px` }}>
      <div class="tp-under-plane" style={{ transform: `translate3d(0,${-scroll}px,0)` }}>
        <div class="tp-head">
          <span class="tp-row-logo"><ChannelLogo channel={channel} /></span>
          {p.number !== null ? <span class="n">{p.number}</span> : null}
          <span class="t">{channel.name}</span>
        </div>
        {art ? (
          <div class="tp-art">
            <button type="button" tabIndex={-1} data-ug="poster" class={`tp-art-poster${p.at === "poster" ? " foc" : ""}`} onClick={p.onPoster}>
              <ProgrammePoster url={art.posterUrl} width={96} />
            </button>
            <div class="tp-art-text">
              <div class="tp-art-title">{art.title}</div>
              {aboutText(art) ? <FittedAbout text={aboutText(art)} /> : null}
            </div>
          </div>
        ) : null}
        {lines !== null && lines.length === 0 ? <div class="tp-none" style={{ top: `${UNDER_HEAD + (art ? UNDER_ART : 0)}px` }}>{t("tbNoGuideShort")}</div> : rows}
      </div>
      {/* A soft edge where the list slides under the picture, instead of a hard cut. */}
      {scroll > 0 ? <div class="tp-under-fade" /> : null}
    </div>
  );
}
