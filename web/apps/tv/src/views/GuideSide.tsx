import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { archiveUrl, type Channel } from "@skmate/core";
import type { Programme } from "@skmate/epg";
import { Icon, isBack } from "@skmate/ui";
import { t } from "../i18n";
import { GuideContext } from "../state/GuideContext";
import { useProgrammeArt, type ArtSettings, type ProgrammeArt } from "../state/tmdb";
import { capitalize } from "../text";
import { clock } from "../time";
import { ChannelLogo } from "./ChannelLogo";
import { daysText, timeLeftText } from "./Left";
import { PosterViewer } from "./ProgrammeArt";

const DAY = 86_400_000;
/** Local midnight of the day [ms] falls in. */
const dayOf = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const lang = () => (typeof document !== "undefined" && document.documentElement.lang) || undefined;
/** "Today", "Yesterday", "Tomorrow" in the app's language, else the weekday; with the date under it. */
function dayTitle(day: number, today: number): { name: string; date: string } {
  const diff = Math.round((day - today) / DAY);
  const date = new Date(day);
  const dd = `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
  try {
    // Older TVs (webOS 4, Tizen 4) have no RelativeTimeFormat: the weekday stands in for "today".
    const rel = (Intl as unknown as { RelativeTimeFormat?: new (l?: string, o?: object) => { format(n: number, u: string): string } }).RelativeTimeFormat;
    if (rel && Math.abs(diff) <= 1) return { name: capitalize(new rel(lang(), { numeric: "auto" }).format(diff, "day")), date: dd };
    return { name: capitalize(new Intl.DateTimeFormat(lang(), { weekday: "long" }).format(date)), date: dd };
  } catch {
    return { name: dd, date: "" };
  }
}
/** A press of OK held this long is a hold: the poster, never the programme (2.6.1). */
const HOLD_MS = 600;

interface Line { p: Programme; archive: boolean }

/**
 * The focused channel's programme in the list's place, ▶ on a channel, one day at a time (2.6.3, as asked in the
 * chat): the day on top with ‹ ›, the archive's depth under it, that day's programmes; aired ones the archive keeps
 * are marked, what is on marked LIVE with what is left. ▶ (or ▲ from the first programme) reaches the day, where ◀ ▶ go to
 * the day before and after (back as far as the archive reaches). OK on an aired one plays it from the archive, on
 * what is on watches the channel, on one to come asks about a reminder; held OK on one with a poster shows the
 * poster. ◀ on a programme or Back go back to the list.
 */
export function GuideSide(p: {
  channel: Channel;
  art: ArtSettings;
  onClose: () => void;
  onWatch: (c: Channel) => void;
  onArchive: (c: Channel, prog: Programme) => void;
  onUpcoming?: (c: Channel, prog: Programme) => void;
}) {
  const { data, now } = useContext(GuideContext);
  const ch = p.channel;
  const depth = Math.min(7, ch.catchupDays ?? 0);
  const today = dayOf(now);
  const items = data.of(ch.id);
  // The days: back as far as the archive reaches, on to the last day the guide has.
  const lastDay = Math.max(today, items.length > 0 ? dayOf((items[items.length - 1] as Programme).start) : today);
  const firstDay = today - depth * DAY;
  const [day, setDay] = useState(today);
  const lines = useMemo<Line[]>(() => items
    .filter((x) => x.stop > day && x.start < day + DAY)
    .map((x) => ({ p: x, archive: x.stop <= Date.now() && archiveUrl(ch, x.start, x.stop) !== null })),
  [ch.id, items, day, Math.floor(now / 60_000)]);
  // A day not in memory yet is read in from the stored guide.
  useEffect(() => { data.need(day - 3_600_000, day + DAY + 3_600_000); }, [day, ch.id]);

  // Where focus starts: what is on today; a channel with only its archive, the last aired programme (2.6.1).
  const startAt = (ls: Line[]) => {
    const on = ls.findIndex((l) => l.p.start <= now && now < l.p.stop);
    if (on >= 0) return on;
    const next = ls.findIndex((l) => l.p.start > now);
    return next >= 0 ? next : Math.max(0, ls.length - 1);
  };
  const [at, setAt] = useState(() => startAt(lines));
  const [onHead, setOnHead] = useState(false);
  const [desc, setDesc] = useState<string | undefined>();
  const [big, setBig] = useState<ProgrammeArt | null>(null);
  useEffect(() => { setDay(today); setOnHead(false); }, [ch.id]);
  const placed = useRef("");
  useEffect(() => {
    // A new day (or its first lines arriving): focus on its start, or on what is on today.
    const key = `${ch.id}|${day}|${lines.length > 0}`;
    if (placed.current === key) return;
    placed.current = key;
    setAt(day === today ? startAt(lines) : 0);
  }, [ch.id, day, lines.length]);
  const line = lines[Math.min(at, Math.max(0, lines.length - 1))];
  const art = useProgrammeArt(line?.p.title ?? null, p.art);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setDesc(undefined);
    if (!line) return;
    let live = true;
    data.describe(ch.id, line.p).then((d) => { if (live) setDesc(d); });
    return () => { live = false; };
  }, [line?.p.start, ch.id]);
  const head = onHead || lines.length === 0;
  useEffect(() => {
    if (big) return;
    const el = box.current?.querySelector<HTMLElement>(head ? `[data-focus="gs-day"]` : `[data-focus="gs-${at}"]`);
    el?.focus();
    if (!head) el?.scrollIntoView?.({ block: "center" });
  }, [at, head, big, day]);

  const pressAt = useRef(0);
  const held = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(holdTimer.current), []);
  const play = (l: Line) => {
    const n = Date.now();
    if (l.archive) p.onArchive(ch, l.p);
    else if (l.p.start <= n && n < l.p.stop) p.onWatch(ch);
    else if (l.p.start > n) p.onUpcoming?.(ch, l.p);
  };
  const go = (d: number) => setDay((x) => Math.max(firstDay, Math.min(lastDay, x + d * DAY)));

  const onKey = (e: KeyboardEvent) => {
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (big) { if (isBack(e) || e.key === "Enter") { stop(); if (!e.repeat) setBig(null); } return; }
    if (isBack(e)) { stop(); p.onClose(); return; }
    const k = e.key;
    if (head) {
      if (k === "ArrowLeft") { stop(); if (day > firstDay) go(-1); else p.onClose(); return; }
      if (k === "ArrowRight") { stop(); go(1); return; }
      if (k === "ArrowDown") { stop(); if (lines.length > 0) { setOnHead(false); setAt(0); } return; }
      if (k === "ArrowUp" || k === "Enter") stop();
      return;
    }
    if (k === "ArrowUp") { stop(); if (at === 0) setOnHead(true); else setAt(at - 1); return; }
    if (k === "ArrowDown") { stop(); if (at < lines.length - 1) setAt(at + 1); return; } // the list's end is a wall
    if (k === "ArrowLeft") { stop(); p.onClose(); return; }
    if (k === "ArrowRight") { stop(); setOnHead(true); return; } // ▶ reaches the day at once, its ◀ ▶ walk the days
    if (k === "PageUp" || k === "PageDown") { stop(); go(k === "PageUp" ? -1 : 1); return; }
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

  const title = dayTitle(day, today);
  return (
    <div class="gs" ref={box} onKeyDown={onKey as unknown as (e: Event) => void} onKeyUp={onKeyUp as unknown as (e: Event) => void}>
      <div class="gs-head">
        <span class="gs-logo"><ChannelLogo channel={ch} /></span>
        <span class="gs-name">{ch.name}</span>
      </div>
      <div class="gs-days">
        <span class={`gs-arrow${day > firstDay ? "" : " off"}`}><Icon name="chevron_left" size={26} /></span>
        <button class="gs-day" tabIndex={-1} data-focus="gs-day" onClick={(ev) => { if ((ev as MouseEvent).detail > 0) go(1); }}>
          <span class="gs-day-name">{title.name}</span>
          <span class="gs-day-date">{title.date}</span>
        </button>
        <span class={`gs-arrow${day < lastDay ? "" : " off"}`}><Icon name="chevron" size={26} /></span>
      </div>
      {depth > 0 ? <div class="gs-depth">{t("groupArchive")} · {daysText(depth)}</div> : null}
      {lines.length === 0 ? (
        // No guide for the day: a picture and one line in the middle (2.6.0).
        <div class="gs-none">
          <Icon name="epg" size={64} />
          <div>{t("tbNoGuideShort")}</div>
        </div>
      ) : (
        <div class="gs-lines">
          {lines.map((l, i) => {
            const live = l.p.start <= now && now < l.p.stop;
            const gone = l.p.stop <= now && !l.archive;
            const done = live ? Math.max(0, Math.min(1, (now - l.p.start) / Math.max(1, l.p.stop - l.p.start))) : 0;
            return (
              <>
                <button key={l.p.start} tabIndex={-1} data-focus={`gs-${i}`}
                  class={`gs-line${live ? " gs-onair" : ""}${gone ? " gs-gone" : ""}`}
                  onFocus={() => { if (at !== i) { setAt(i); setOnHead(false); } }} onClick={(ev) => { if ((ev as MouseEvent).detail > 0) play(l); }}>
                  <span class="gs-at">{clock(l.p.start)}{live ? <span class="gs-live">LIVE</span> : null}</span>
                  <span class="gs-main">
                    <span class="gs-t">{l.p.title}</span>
                    {live ? <span class="gs-left">{timeLeftText(l.p.stop, now)}</span> : null}
                    {live ? <span class="gs-bar"><i style={{ width: `${(done * 100).toFixed(1)}%` }} /></span> : null}
                  </span>
                  {l.archive ? <span class="gs-arch"><Icon name="rewind" size={18} /></span> : null}
                </button>
                {i === at && !onHead && (desc || art) ? (
                  <div class="gs-about" key={`d${l.p.start}`}>{[art?.year, desc ?? art?.overview].filter(Boolean).join(" · ")}</div>
                ) : null}
              </>
            );
          })}
        </div>
      )}
      {big ? <PosterViewer art={big} /> : null}
    </div>
  );
}
