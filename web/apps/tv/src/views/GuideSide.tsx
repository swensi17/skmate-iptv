import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import type { Programme } from "@skmate/epg";
import { Icon, isBack, isMenuKey } from "@skmate/ui";
import { t } from "../i18n";
import { GuideContext } from "../state/GuideContext";
import { useProgrammeArt, type ArtSettings, type ProgrammeArt } from "../state/tmdb";
import { clock } from "../time";
import { ChannelLogo } from "./ChannelLogo";
import { PosterViewer } from "./ProgrammeArt";
import { scheduleLines, type ScheduleLine } from "./Schedule";

/** Local midnight of the day [ms] falls in. */
const dayOf = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const DAY_FMT = typeof Intl !== "undefined" ? new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }) : null;
const WEEKDAY_FMT = typeof Intl !== "undefined" ? new Intl.DateTimeFormat(undefined, { weekday: "short" }) : null;
const DATE_FMT = typeof Intl !== "undefined" ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }) : null;
const DAY_MS = 86_400_000;
/** "Today", "Yesterday", "Tomorrow", or the day itself (LiveGuideSide.kt dayName). */
function dayLabel(day: number, now: number): string {
  const today = dayOf(now);
  if (day === today) return t("gsToday");
  if (day === dayOf(today - DAY_MS / 2)) return t("gsYesterday");
  if (day === dayOf(today + DAY_MS + DAY_MS / 2)) return t("gsTomorrow");
  return DAY_FMT ? DAY_FMT.format(new Date(day)) : new Date(day).toDateString();
}
/** A rest before the column follows another channel while the list has the remote: rows passed on the way cost nothing. */
const FOLLOW_REST_MS = 160;
/** A programme row (56) and how many stand above the one the column opens on. */
const LINE_PITCH = 56;
const LINES_ABOVE = 3;
/** A press of OK held this long is a hold: the poster, never the programme (2.6.1). */
const HOLD_MS = 600;

/**
 * The focused channel's guide, a column over the preview with the list staying beside it (Android LiveGuideSide.kt,
 * 2.6.7 / 2.7.0): its programmes by day, aired ones with the archive mark and what is on marked live, the days listed on
 * the right; the focused programme tells what it is about. ▶ on a channel moves the remote into the column, ◀ gives it
 * back to the list (the column keeps following the channel under the cursor), Back closes the column. OK on an aired
 * programme plays it from the archive, on what is on watches the channel, on one to come asks about a reminder; held OK on
 * a programme with a poster shows the poster over the whole screen.
 */
export function GuideSide(p: {
  channel: Channel;
  art: ArtSettings;
  /** Back: the column goes away. */
  onClose: () => void;
  /** ◀ on a programme: the remote goes back to the list, the column stays; absent: ◀ closes as Back does. */
  onLeft?: () => void;
  /** False while the list beside holds the remote and the column only follows along. */
  takeFocus?: boolean;
  /** Bumped when the remote should come into the column again. */
  refocus?: number;
  onWatch: (c: Channel) => void;
  onArchive: (c: Channel, prog: Programme) => void;
  onUpcoming?: (c: Channel, prog: Programme) => void;
}) {
  const { data, now } = useContext(GuideContext);
  const takeFocus = p.takeFocus !== false;
  // The channel drawn: at once when the remote is in the column, after a short rest while it only follows.
  const [channel, setChannel] = useState(p.channel);
  useEffect(() => {
    if (p.channel.id === channel.id) return;
    if (takeFocus) { setChannel(p.channel); return; }
    const id = setTimeout(() => setChannel(p.channel), FOLLOW_REST_MS);
    return () => clearTimeout(id);
  }, [p.channel.id, takeFocus]);
  const items = data.of(channel.id);
  const lines = useMemo(() => {
    const at = Date.now();
    // The archive's aired programmes, what is on, then every programme the guide still holds ahead.
    const head = scheduleLines(channel, items, at);
    const last = head.length > 0 ? (head[head.length - 1] as ScheduleLine).start : at;
    const ahead = items.filter((x) => x.start > last).map((x): ScheduleLine => ({ start: x.start, stop: x.stop, title: x.title, archive: null }));
    return head.concat(ahead);
  }, [channel.id, items, Math.floor(now / 60_000)]);
  const days = useMemo(() => Array.from(new Set(lines.map((l) => dayOf(l.start)))), [lines]);
  // What is on, or (a channel with only its archive) the last aired line (2.6.1).
  const startAt = useMemo(() => {
    const on = lines.findIndex((l) => l.start <= now && now < l.stop);
    if (on >= 0) return on;
    const next = lines.findIndex((l) => l.start > now);
    return next >= 0 ? next : Math.max(0, lines.length - 1);
  }, [channel.id, lines.length]);
  const [at, setAt] = useState(startAt);
  const [onDays, setOnDays] = useState(false);
  const [desc, setDesc] = useState<string | undefined>();
  const [big, setBig] = useState<ProgrammeArt | null>(null);
  useEffect(() => { setAt(startAt); setOnDays(false); }, [channel.id]);
  const line = lines[at];
  const art = useProgrammeArt(line?.title ?? null, p.art);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setDesc(undefined);
    if (!line || !takeFocus) return; // only following the list: nothing is looked up per row passed
    let live = true;
    const prog = items.find((x) => x.start === line.start);
    if (prog) data.describe(channel.id, prog).then((d) => { if (live) setDesc(d); });
    return () => { live = false; };
  }, [line?.start, channel.id, takeFocus]);
  /** Scrolls the programmes so [el] stands [above] rows from the top (LiveGuideSide LINES_ABOVE); the page itself never moves. */
  const bring = (el: HTMLElement | null | undefined, above: number) => {
    const col = box.current?.querySelector<HTMLElement>(".gs-lines");
    if (!col || !el) return;
    col.scrollTop = Math.max(0, el.offsetTop - above * LINE_PITCH);
  };
  useEffect(() => {
    if (big) return;
    const row = box.current?.querySelector<HTMLElement>(`[data-focus="gs-${at}"]`);
    if (!takeFocus) { bring(row, LINES_ABOVE); return; } // only following the list: no focus taken
    const sel = onDays ? `[data-focus="gs-day-${dayOf(lines[at]?.start ?? now)}"]` : `[data-focus="gs-${at}"]`;
    const el = box.current?.querySelector<HTMLElement>(sel);
    if (el && document.activeElement !== el) el.focus();
    if (onDays) {
      // On the days, the programmes follow: the chosen day's heading comes to the top.
      bring(row?.previousElementSibling as HTMLElement | null, 0);
      el?.scrollIntoView?.({ block: "nearest" });
    } else bring(row, LINES_ABOVE);
  }, [at, onDays, big, lines.length, takeFocus, p.refocus, channel.id]);

  const pressAt = useRef(0);
  const held = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(holdTimer.current), []);
  const play = (l: ScheduleLine) => {
    const n = Date.now();
    if (l.archive) p.onArchive(channel, l.archive);
    else if (l.start <= n && n < l.stop) p.onWatch(channel);
    else if (l.start > n) { const prog = items.find((x) => x.start === l.start); if (prog) p.onUpcoming?.(channel, prog); }
  };

  const onKey = (e: KeyboardEvent) => {
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (big) { if (isBack(e) || e.key === "Enter") { stop(); if (e.type === "keydown" && !e.repeat) setBig(null); } return; }
    if (isBack(e)) { stop(); if (onDays) setOnDays(false); else p.onClose(); return; }
    // The Menu key shows the poster, as holding OK does (LiveGuideSide.kt:448).
    if (isMenuKey(e)) { stop(); if (art) setBig(art); return; }
    const k = e.key;
    if (onDays) {
      const i = days.indexOf(dayOf(line?.start ?? now));
      if (k === "ArrowUp" || k === "ArrowDown") {
        stop();
        const d = days[Math.max(0, Math.min(days.length - 1, i + (k === "ArrowUp" ? -1 : 1)))];
        const first = lines.findIndex((l) => dayOf(l.start) === d);
        if (first >= 0) setAt(first);
        return;
      }
      if (k === "ArrowLeft" || k === "Enter") { stop(); setOnDays(false); return; }
      if (k === "ArrowRight") { stop(); return; }
      return;
    }
    if (k === "ArrowUp") { stop(); setAt((x) => Math.max(0, x - 1)); return; } // the ends are walls
    if (k === "ArrowDown") { stop(); setAt((x) => Math.min(lines.length - 1, x + 1)); return; }
    if (k === "ArrowLeft") { stop(); (p.onLeft ?? p.onClose)(); return; }
    if (k === "ArrowRight") { stop(); if (days.length > 1) setOnDays(true); return; }
    if (k === "Enter") {
      stop();
      if (e.repeat) return;
      pressAt.current = Date.now();
      held.current = false;
      clearTimeout(holdTimer.current);
      holdTimer.current = setTimeout(() => { held.current = true; if (art) setBig(art); }, HOLD_MS);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || pressAt.current === 0) return;
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(holdTimer.current);
    const wasHeld = held.current || Date.now() - pressAt.current >= HOLD_MS;
    pressAt.current = 0;
    // A held OK never plays the line on release, poster or not (2.6.1).
    if (!wasHeld && line) play(line);
  };

  return (
    <div class="gs" ref={box} onKeyDown={onKey as unknown as (e: Event) => void} onKeyUp={onKeyUp as unknown as (e: Event) => void}>
      <div class="gs-head">
        <span class="gs-logo"><ChannelLogo channel={channel} /></span>
        <span class="gs-name">{channel.name}</span>
      </div>
      {lines.length === 0 ? (
        // No guide: a picture and one line in the middle, focus on the name so ◀ and Back still answer (2.6.0).
        <div class="gs-none" tabIndex={-1} data-focus="gs-0">
          <Icon name="epg" size={64} />
          <div>{t("tbNoGuideShort")}</div>
        </div>
      ) : (
        <div class="gs-body">
          <div class="gs-lines">
            {lines.map((l, i) => {
              const live = l.start <= now && now < l.stop;
              const past = l.stop <= now;
              const newDay = i === 0 || dayOf((lines[i - 1] as ScheduleLine).start) !== dayOf(l.start);
              return (
                <>
                  {newDay ? <div class="gs-dayhead" key={`h${l.start}`}>{dayLabel(dayOf(l.start), now)}</div> : null}
                  <button key={l.start} tabIndex={-1} data-focus={`gs-${i}`}
                    class={`gs-line${live ? " gs-onair" : ""}${past && !l.archive ? " gs-gone" : ""}`}
                    onFocus={() => { if (at !== i) setAt(i); }} onClick={(ev) => { if ((ev as MouseEvent).detail > 0) play(l); }}>
                    <span class="gs-at">{clock(l.start)}</span>
                    <span class="gs-t">{l.title}</span>
                    {l.archive ? <span class="gs-arch"><Icon name="rewind" size={18} /></span> : null}
                    {live ? <span class="gs-live">LIVE</span> : null}
                  </button>
                  {i === at && takeFocus && (desc || art) ? (
                    <div class="gs-about" key={`d${l.start}`}>{[art?.year, desc ?? art?.overview].filter(Boolean).join(" · ")}</div>
                  ) : null}
                </>
              );
            })}
          </div>
          {days.length > 1 ? (
            <div class="gs-days">
              <div class="gs-days-head">{t("gsDays")}</div>
              <div class="gs-days-list">
                {days.map((d) => (
                  <button key={d} tabIndex={-1} data-focus={`gs-day-${d}`} class={`gs-day${d === dayOf(line?.start ?? now) ? " on" : ""}${d === dayOf(now) ? " today" : ""}`}>
                    <span>{WEEKDAY_FMT ? WEEKDAY_FMT.format(new Date(d)) : ""}</span>
                    <span>{DATE_FMT ? DATE_FMT.format(new Date(d)) : ""}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
      {big ? <PosterViewer art={big} /> : null}
    </div>
  );
}
