import { isFavorite } from "../state/favorites";
import { memo } from "preact/compat";
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { hasArchive, type Channel } from "@skmate/core";
import type { GuideData, Programme } from "@skmate/epg";
import { Button, focusFirst, focusWithoutScroll, Icon, isBack, Menu, MenuItem, useOwnBack } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import { GuideContext } from "../state/GuideContext";
import type { GuideStatus } from "../state/useGuide";
import type { Settings } from "../state/settings";
import {
  cellsIn, cursorStep, followCursor, gapAround, guideWindow, programmeAt, pxAt, ROW_GAP, ROW_STEP, SLOT_MIN, stepScroll, timeAt,
} from "../state/guideGrid";
import { clock } from "../time";
import { PreviewVideo } from "./PreviewPane";
import { Ticks } from "./Spinner";
import "./guide.css";

/*
 * The TV Guide, ported 1:1 from the Android app's TV-box look (features/epg/EpgScreen.kt, GuideStage.kt, GuideCore.kt):
 * the video top left (640×360) and the programme under the cursor beside it; the day and the ruler with the blue "now"
 * chip and line; slim rows of channel labels and programme cells. No control line, no key hints (TvBoxNav).
 *
 * Each row's programmes are one focus target with a time cursor, as on Android: row stage (the light bar on the row,
 * ▲ ▼ rows, ◀ leaves for the menu, ▶ or OK enter the row) and cell stage (◀ ▶ programme by programme, OK watches, Back
 * returns to row stage). Holding OK opens the programme menu.
 *
 * Fast on a 2019 TV: only the rows in view exist, and only the cells near the view; the strips and the labels sit on
 * planes moved by `transform`, so a scroll is one style change; a row repaints only when its own props change.
 */

/** The stage is 1728 mpx wide; `fx(n)` = n of 1920 of its width, as Android's `fx`. */
const W = 1728;
const fx = (n: number) => (W * n) / 1920;
const LABEL_W = (W * 296) / 1920;
const LEFT = fx(48);
const GX = LEFT + LABEL_W;
const TIMELINE_W = W - fx(48) - LABEL_W - fx(64);
const GRID_TOP = 44 + 360 + 30;
const ROWS_TOP = GRID_TOP + 48;
const VIEW_H = 972 - ROWS_TOP;
/** Android clips the strip 40 past its right edge, so the last cell runs a little under the screen's margin. */
const CLIP_EXTRA = 40;
/** Cells are kept this far beyond the view, so a step of the cursor rarely has to build new ones. */
const OVERSCAN_X = 220;
const PREVIEW_DELAY_MS = 700;
const HOLD_MS = 500;
const MENU_RETURN_MS = 60;
const MINUTE = 60_000;

/** The row the viewer last watched from, so the guide reopens on it (Android: `lastTunedChannelId`). */
let lastTuned: string | null = null;

interface Props {
  settings: Settings;
  channels: Channel[];
  favorites: ReadonlySet<string>;
  status: GuideStatus;
  onRefresh: () => void;
  onOpen: (c: Channel, list: readonly Channel[]) => void;
  /** A past programme on a channel that keeps a recording of it. */
  onArchive: (c: Channel, p: Programme, list: readonly Channel[]) => void;
  /** A programme still to come: the app's own "watch or be reminded" dialog (used when [onRemind] is not given). */
  onUpcoming: (c: Channel, p: Programme, list: readonly Channel[]) => void;
  /** Whether a reminder is set for that programme (a bell on it). */
  reminded: (c: Channel, p: Programme) => boolean;
  /** Remind me / cancel the reminder of a programme still to come (the programme menu). */
  onRemind?: (c: Channel, p: Programme) => void;
  /** Add or remove the channel from favourites (the programme menu). */
  onFav?: (c: Channel) => void;
}

type MenuFor = { channel: Channel; programme: Programme | null } | null;

export function GuideView(p: Props) {
  const { settings, channels, favorites, status } = p;
  const { data, now } = useContext(GuideContext);
  const syncing = status.kind === "syncing";
  const firstGuide = status.kind === "syncing" && status.first === true;
  // A channel is a row when the guide has it at all, also when the hours in memory hold none of its programmes:
  // rows do not come and go as the grid scrolls and days are read in. While a first guide arrives (2.5.2), a channel
  // already linked is a row too, with a quiet bar until its programmes are written.
  // The same rows stay the same array when a fresh guide replaces the stored one, so nothing below them moves.
  const prevRows = useRef<Channel[]>([]);
  const rows = useMemo(() => {
    const next = channels.filter((c) => data.stored(c.id) || (firstGuide && data.links.has(c.id)));
    const prev = prevRows.current;
    return next.length === prev.length && next.every((c, i) => c === prev[i]) ? prev : next;
  }, [channels, data, firstGuide]);
  const numberOf = useMemo(() => { const m = new Map<string, number>(); channels.forEach((c, i) => m.set(c.id, i + 1)); return m; }, [channels]);
  const numW = Math.max(38, String(channels.length).length * 11);
  const halfHour = Math.floor(now / (30 * MINUTE));
  const win = useMemo(() => {
    let last = 0;
    for (const c of rows) { const l = data.of(c.id); const s = l.length ? (l[l.length - 1] as Programme).stop : 0; if (s > last) last = s; }
    // A guide kept in IndexedDB reaches further than what is in memory: the days kept (Settings).
    return guideWindow(now, Math.max(last, data.horizon));
  }, [rows, data, halfHour]);
  const maxX = Math.max(0, Math.round(pxAt(win.end, win.start) - TIMELINE_W));
  const maxY = Math.max(0, rows.length * ROW_STEP - ROW_GAP + 24 - VIEW_H);

  // --- Focus, cursor and the two scrolls (refs mirror them, so a held key counts from where the last press went) ---
  const startRow = Math.max(0, lastTuned ? rows.findIndex((c) => c.id === lastTuned) : 0);
  const [row, setRow] = useState(startRow);
  const [cellMode, setCellMode] = useState(false);
  const [gridFocused, setGridFocused] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(() => stepScroll(startRow, 0, VIEW_H, maxY));
  const [menu, setMenu] = useState<MenuFor>(null);
  const [tick, setTick] = useState(0);
  const st = useRef({ row, cursor, scrollX, scrollY, cellMode });
  st.current = { row, cursor, scrollX, scrollY, cellMode };
  const view = useRef<HTMLDivElement>(null);
  const okDown = useRef(false);
  const holdTimer = useRef(0);
  const holdGuard = useRef(false);

  // The time a programme is shown 3/8 of the way across, as the Android guide opens: room on both sides of "now".
  // Set before the frame is painted (2.5.2): the grid never shows the start of its window, and that date, first.
  useLayoutEffect(() => { setScrollX(Math.round(Math.min(maxX, Math.max(0, pxAt(Date.now(), win.start) - (TIMELINE_W * 3) / 8)))); }, [win.start, rows.length > 0]);
  // Other rows (a fresh guide has more or fewer channels): the focus stays on the channel it was on, at the same
  // height on the screen, before anything is painted; a playlist with fewer rows keeps it on one that exists.
  useLayoutEffect(() => {
    const prev = prevRows.current;
    prevRows.current = rows;
    if (prev === rows || prev.length === 0) return;
    const was = prev[st.current.row];
    const at = was ? rows.indexOf(was) : -1;
    if (at >= 0 && at !== st.current.row) {
      const y = Math.min(Math.max(0, rows.length * ROW_STEP - ROW_GAP + 24 - VIEW_H), Math.max(0, st.current.scrollY + (at - st.current.row) * ROW_STEP));
      st.current.row = at;
      st.current.scrollY = y;
      setRow(at);
      setScrollY(y);
    } else if (at < 0 && st.current.row > rows.length - 1) { setRow(Math.max(0, rows.length - 1)); setScrollY(0); }
  }, [rows]);

  // The grid of a long playlist takes a while to lay out on a TV: the screen first shows that the guide is coming,
  // and the grid is built a frame later, so the wait is never an empty grey page.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let timer = 0;
    const frame = requestAnimationFrame(() => { timer = window.setTimeout(() => setReady(true), 0); });
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, []);
  const grid = ready && rows.length > 0;
  // The stored guide is read in a moment after the start: until then (and while a first download runs) a spinner.
  const loading = !grid && (!ready || syncing || status.kind === "restoring");
  useEffect(() => { if (grid) { try { performance.mark("skmate:guide-grid"); } catch { /* no user timing */ } } }, [grid]);
  useEffect(() => {
    // The state follows the focus call itself too: a window that is not focused yet (a TV app still starting) sends no focus event.
    if (grid && view.current) { focusWithoutScroll(view.current); if (document.activeElement === view.current) setGridFocused(true); }
    else if (!loading) focusFirst(document, "guide-empty-refresh");
  }, [grid, loading]);

  // --- The preview: it stays on its channel while the guide is browsed; OK brings a row's channel into it, and it
  // plays 700 ms later. One decoder on a TV: this is the only <video> of the screen, released when it goes. ---
  const effPreview = settings.preview;
  const [preview, setPreview] = useState<Channel | null>(null);
  const [playing, setPlaying] = useState<Channel | null>(null);
  useEffect(() => {
    setPlaying(null);
    if (!preview || !effPreview) return;
    const id = setTimeout(() => setPlaying(preview), PREVIEW_DELAY_MS);
    return () => clearTimeout(id);
  }, [preview?.id, effPreview]);
  const previewNeeds = (c: Channel) => effPreview && preview?.id !== c.id;

  const listOf = (i: number): readonly Programme[] => { const c = rows[i]; return c ? data.of(c.id) : []; };
  const cursorOr = (c: number) => (c >= win.start && c < win.end ? c : Date.now());

  // --- Moving ---
  const showCursor = (c: number) => {
    setCursor(c);
    setScrollX(followCursor(pxAt(c, win.start), st.current.scrollX, TIMELINE_W, maxX));
  };
  const stepRow = (to: number) => {
    st.current.row = to;
    setRow(to);
    const y = stepScroll(to, st.current.scrollY, VIEW_H, maxY);
    st.current.scrollY = y;
    setScrollY(y);
  };
  const enterCell = (i: number) => {
    const c = rows[i];
    showCursor(Date.now());
    setCellMode(true);
    if (c && previewNeeds(c)) setPreview(c);
  };
  const watch = (c: Channel) => { lastTuned = c.id; p.onOpen(c, rows); };
  const ok = (i: number) => {
    const c = rows[i];
    if (!c) return;
    if (previewNeeds(c)) { setPreview(c); return; }
    const prog = programmeAt(listOf(i), st.current.cursor);
    const at = Date.now();
    if (prog && prog.stop <= at && hasArchive(c, prog.start, prog.stop, at)) { lastTuned = c.id; p.onArchive(c, prog, rows); }
    else watch(c);
  };
  const openMenu = () => {
    const c = rows[st.current.row];
    if (!c) return;
    setMenu({ channel: c, programme: programmeAt(listOf(st.current.row), st.current.cursor || Date.now()) });
  };
  const closeMenu = () => {
    setMenu(null);
    setTick((n) => n + 1);
    setTimeout(() => { if (view.current) { focusWithoutScroll(view.current); if (document.activeElement === view.current) setGridFocused(true); } }, MENU_RETURN_MS);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key;
    const code = e.keyCode;
    const consume = () => { e.preventDefault(); e.stopPropagation(); };
    const s = st.current;
    if (k === "Enter" || code === 13) {
      consume();
      // Held: the programme menu, on the remote's own repeat (Android: the second KeyDown of a held OK) or after
      // HOLD_MS on a TV that does not repeat. The rest of the hold is swallowed (holdGuard).
      const hold = () => { clearTimeout(holdTimer.current); if (!okDown.current) return; okDown.current = false; holdGuard.current = true; openMenu(); };
      if (e.repeat) { hold(); return; }
      if (okDown.current) return;
      okDown.current = true;
      clearTimeout(holdTimer.current);
      holdTimer.current = window.setTimeout(hold, HOLD_MS);
      return;
    }
    if (k === "ContextMenu" || code === 93) { consume(); openMenu(); return; }
    if (k === "ArrowLeft" || code === 37) {
      if (!s.cellMode) return; // row stage: the side menu, through the app's own arrows
      consume();
      showCursor(cursorStep(listOf(s.row), cursorOr(s.cursor), -1, win.start, win.end));
      return;
    }
    if (k === "ArrowRight" || code === 39) {
      consume();
      if (!s.cellMode) enterCell(s.row);
      else showCursor(cursorStep(listOf(s.row), cursorOr(s.cursor), +1, win.start, win.end));
      return;
    }
    if (k === "ArrowUp" || code === 38) {
      if (s.row === 0) return; // up to whatever is above (nothing, in the guide)
      consume();
      setCellMode(false);
      stepRow(s.row - 1);
      return;
    }
    if (k === "ArrowDown" || code === 40) {
      consume();
      if (s.row < rows.length - 1) { setCellMode(false); stepRow(s.row + 1); }
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!(e.key === "Enter" || e.keyCode === 13) || !okDown.current) return;
    e.preventDefault();
    okDown.current = false;
    clearTimeout(holdTimer.current);
    if (st.current.cellMode) ok(st.current.row); else enterCell(st.current.row);
  };

  // Back in a row's programmes returns to the row; and the rest of a held OK must not press the menu's first item.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (holdGuard.current && (e.key === "Enter" || e.keyCode === 13)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (!isBack(e) || !st.current.cellMode || document.querySelector("[data-modal]")) return;
      if (document.activeElement !== view.current) return;
      e.preventDefault(); e.stopImmediatePropagation();
      setCellMode(false);
    };
    const onUp = (e: KeyboardEvent) => { if (e.key === "Enter" || e.keyCode === 13) holdGuard.current = false; };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onUp, true);
    return () => { document.removeEventListener("keydown", onKey, true); document.removeEventListener("keyup", onUp, true); clearTimeout(holdTimer.current); };
  }, []);

  // The rows get callbacks that never change, so `memo` skips every row whose own props did not move.
  const latest = useRef({ reminded: p.reminded, clickCell: (_i: number, _p: Programme | null, _at: number) => {} });
  const stable = useMemo(() => ({
    reminded: (c: Channel, pr: Programme) => latest.current.reminded(c, pr),
    onCell: (i: number, pr: Programme | null, at: number) => latest.current.clickCell(i, pr, at),
  }), []);

  // A pointer: a cell takes the cursor (and a second click on it is OK); a channel's label watches it.
  const clickCell = (i: number, prog: Programme | null, at: number) => {
    if (view.current && document.activeElement !== view.current) focusWithoutScroll(view.current);
    const sameRow = st.current.row === i && st.current.cellMode;
    const t0 = prog ? Math.max(prog.start, win.start) : at;
    if (sameRow && prog && programmeAt(listOf(i), st.current.cursor) === prog) { ok(i); return; }
    stepRow(i);
    setCellMode(true);
    showCursor(t0);
  };
  latest.current = { reminded: p.reminded, clickCell };

  // --- What the top shows: the programme under the cursor on the focused row (Android: `selected`) ---
  const topChannel = rows[Math.min(row, rows.length - 1)] ?? null;
  const topList = topChannel ? data.of(topChannel.id) : [];
  const shown = topChannel ? programmeAt(topList, cursor > 0 ? cursor : now) : null;
  const videoChannel = effPreview && preview ? preview : topChannel;
  const videoNow = videoChannel ? programmeAt(data.of(videoChannel.id), now) : null;
  const dayAt = timeAt(scrollX + (TIMELINE_W * 3) / 8, win.start);

  // The hours in view (and a margin) are asked of the guide: a later day is read in from storage as it comes near.
  const hour = 3_600_000;
  const viewFrom = Math.floor(timeAt(scrollX - OVERSCAN_X, win.start) / hour);
  const viewTo = Math.ceil(timeAt(scrollX + TIMELINE_W + OVERSCAN_X, win.start) / hour);
  useEffect(() => { if (grid) data.need(viewFrom * hour, viewTo * hour); }, [grid, viewFrom, viewTo, data]);

  // The description of a programme far ahead is on disk: read when the cursor rests on it.
  const [desc, setDesc] = useState<{ p: Programme; text: string } | null>(null);
  useEffect(() => {
    if (!shown || shown.desc || !topChannel) return;
    let live = true;
    const id = setTimeout(() => { void data.describe(topChannel.id, shown).then((text) => { if (live && text) setDesc({ p: shown, text }); }); }, 250);
    return () => { live = false; clearTimeout(id); };
  }, [shown, topChannel?.id, data]);
  const synopsis = shown?.desc ?? (desc && shown && desc.p.start === shown.start && desc.p.title === shown.title ? desc.text : "");

  // --- Rows and cells in view ---
  const first = Math.max(0, Math.floor(scrollY / ROW_STEP) - 1);
  const last = Math.min(rows.length - 1, Math.floor((scrollY + VIEW_H) / ROW_STEP) + 1);
  const shownRows: number[] = [];
  for (let i = first; i <= last; i++) shownRows.push(i);
  const nowX = pxAt(now, win.start) - scrollX;
  const lit = gridFocused && !cellMode;

  return (
    <div class="screen gd">
      <div class="gd-video">
        {videoChannel ? <span class="gd-logo"><Logo channel={videoChannel} data={data} size={48} /></span> : null}
        {playing && effPreview ? <PreviewVideo key={playing.url} channel={playing} settings={settings} /> : null}
        <span class="gd-shade" />
        {videoChannel ? (
          <div class="gd-cap">
            {numberOf.get(videoChannel.id) ?? ""} · {videoChannel.name}
            {videoNow && now < videoNow.stop ? <span> · {videoNow.title}</span> : null}
          </div>
        ) : null}
      </div>

      {topChannel ? (
        <div class="gd-block">
          {shown ? <div class="gd-eyebrow"><Icon name="clock" size={18} /><span>{eyebrow(shown, topChannel.name, now)}</span></div> : null}
          <div class="gd-title">{shown?.title ?? topChannel.name}</div>
          {shown ? null : <div class="gd-details">{t("gssNoProgramme")}</div>}
          <div class="gd-syn">{synopsis}</div>
        </div>
      ) : null}

      {loading ? (
        <div class="gd-state" role="status" aria-label={t("guideLoading")}>
          <span class="gd-spin"><Ticks /></span>
          {syncing && status.text !== t("guideLoading") ? <div class="gd-state-hint">{status.text}</div> : null}
        </div>
      ) : !grid ? (
        <div class="gd-state">
          <div class="gd-state-title">{t("gssNoGuide")}</div>
          <div class="gd-state-body">{t("guideEmptyHint")}</div>
          <div class="gd-state-act"><Button small id="guide-empty-refresh" icon="refresh" text={t("guideRefresh")} onClick={p.onRefresh} /></div>
        </div>
      ) : (
        <>
          <div class="gd-day">{dayLabel(dayAt)}</div>
          {syncing ? <div class="gd-sync" role="status"><span class="gd-sync-spin"><Ticks /></span>{status.text}</div> : null}
          <Ruler start={win.start} end={win.end} now={now} scrollX={scrollX} />
          <div class="gd-labels">
            <div class="gd-plane" style={{ transform: `translate3d(0,${-scrollY}px,0)` }}>
              {shownRows.map((i) => {
                const c = rows[i] as Channel;
                return (
                  <div class={`gd-label${gridFocused && i === row ? " sel" : ""}`} key={c.id} style={{ top: `${i * ROW_STEP}px` }} onClick={() => watch(c)}>
                    <span class="gd-num" style={{ width: `${numW}px` }}>{numberOf.get(c.id) ?? ""}</span>
                    <span class="gd-plate"><Logo channel={c} data={data} size={31} /></span>
                    <span class="gd-name">{c.name}</span>
                    {(c.catchupDays ?? 0) > 0 ? <Icon name="rewind" size={20} /> : null}
                  </div>
                );
              })}
            </div>
          </div>
          <div
            class="gd-view" ref={view} tabIndex={-1} data-focus="guide-grid" aria-label={t("navGuide")}
            onKeyDown={onKeyDown} onKeyUp={onKeyUp}
            onFocus={() => {
              setGridFocused(true);
              if (st.current.cursor < win.start || st.current.cursor >= win.end) setCursor(Date.now());
            }}
            onBlur={() => { setGridFocused(false); okDown.current = false; if (!menu) setCellMode(false); }}
          >
            <div class="gd-plane" style={{ transform: `translate3d(${-scrollX}px,${-scrollY}px,0)` }}>
              {shownRows.map((i) => {
                const c = rows[i] as Channel;
                const sel = i === row;
                return (
                  <Strip
                    key={c.id} index={i} channel={c} list={data.of(c.id)} ws={win.start} we={win.end} now={now} scrollX={scrollX}
                    reading={!data.stored(c.id)}
                    lit={sel && lit} cursor={sel && cellMode ? cursor : -1} tick={tick}
                    reminded={stable.reminded} onCell={stable.onCell}
                  />
                );
              })}
            </div>
          </div>
          {nowX >= 0 && nowX <= TIMELINE_W ? <div class="gd-nowline" style={{ transform: `translate3d(${GX - 1.5 + nowX}px,0,0)` }} /> : null}
        </>
      )}

      {menu ? (
        <GuideMenu
          menu={menu} number={numberOf.get(menu.channel.id)} now={now}
          favorite={isFavorite(favorites, menu.channel)} reminded={menu.programme ? p.reminded(menu.channel, menu.programme) : false}
          lead={settings.reminderLead}
          onWatch={() => { closeMenu(); watch(menu.channel); }}
          onFromStart={menu.programme && hasArchive(menu.channel, menu.programme.start, menu.programme.stop, Date.now())
            ? () => { const m = menu; closeMenu(); lastTuned = m.channel.id; p.onArchive(m.channel, m.programme as Programme, rows); } : null}
          onRemind={menu.programme && menu.programme.start > Date.now()
            ? () => { const m = menu; closeMenu(); if (p.onRemind) p.onRemind(m.channel, m.programme as Programme); else p.onUpcoming(m.channel, m.programme as Programme, rows); } : null}
          onFav={p.onFav ? () => { const m = menu; closeMenu(); p.onFav?.(m.channel); } : null}
          onClose={closeMenu}
        />
      ) : null}
    </div>
  );
}

/** "Live now · 12:15 – 14:45 · 150 min · Channel", "Starts in 58 min · …", or the times alone once it has been on. */
function eyebrow(p: Programme, channelName: string, now: number): string {
  const range = t("gssTimeRange", { a: clock(p.start), b: clock(p.stop) });
  const lead = p.start > now ? t("gssStartsIn", { d: duration(Math.floor((p.start - now + 59_999) / MINUTE)) }) : p.stop > now ? t("gssLiveNow") : null;
  const len = Math.floor((p.stop - p.start) / MINUTE);
  return [lead, range, len > 0 ? t("gssMinutes", { n: len }) : null, channelName].filter((x): x is string => !!x).join(" · ");
}

/** "58 min", "1 h 05 min" (Android `durationText`). */
function duration(min: number): string {
  return min >= 60 ? t("gssHoursMinutes", { h: Math.floor(min / 60), m: String(min % 60).padStart(2, "0") }) : t("gssMinutes", { n: min });
}

/** The day at the 3/8 mark: "ср, 25 нояб." (Android `EEEdMMM`, the app's language). */
function dayLabel(ms: number): string {
  const lang = (typeof document !== "undefined" && document.documentElement.lang) || undefined;
  try { return new Date(ms).toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" }); } catch { return new Date(ms).toDateString(); }
}

/** A channel's logo on its plate, or the TV mark (Android `LivePlate`'s placeholder). */
function Logo({ channel, data, size }: { channel: Channel; data: GuideData; size: number }) {
  const [broken, setBroken] = useState<string | null>(null);
  const src = channel.logo ?? data.logoOf(channel.id);
  if (src && broken !== src) return <img src={src} alt="" decoding="async" onError={() => setBroken(src)} />;
  return <Icon name="live_tv" size={size} />;
}

/** The ruler: a time every half hour (none within 12 minutes of now) and the blue chip on the now-line. */
function Ruler({ start, end, now, scrollX }: { start: number; end: number; now: number; scrollX: number }) {
  const slot = SLOT_MIN * MINUTE;
  const from = timeAt(scrollX - 80, start);
  const to = timeAt(scrollX + TIMELINE_W, start);
  const marks: number[] = [];
  for (let m = Math.ceil(Math.max(start, from) / slot) * slot; m < end && m <= to; m += slot) if (Math.abs(m - now) > 12 * MINUTE) marks.push(m);
  const chipX = pxAt(now, start) - scrollX - 34;
  return (
    <div class="gd-ruler">
      {marks.map((m) => <span class="gd-mark" key={m} style={{ transform: `translate3d(${pxAt(m, start) - scrollX}px,0,0)` }}>{clock(m)}</span>)}
      {now >= start && now <= end && chipX > -80 && chipX < TIMELINE_W ? <span class="gd-chip" style={{ transform: `translate3d(${chipX}px,0,0)` }}>{clock(now)}</span> : null}
    </div>
  );
}

interface StripProps {
  index: number; channel: Channel; list: readonly Programme[]; ws: number; we: number; now: number; scrollX: number;
  /** The row's programmes are still being read (a first guide arriving): a quiet bar where they go. */
  reading?: boolean;
  /** Row stage on this row: the light bar, dark text. */
  lit: boolean;
  /** The cursor, only on the focused row in cell stage (−1 elsewhere, so a cursor move repaints one row). */
  cursor: number;
  tick: number;
  reminded: (c: Channel, p: Programme) => boolean;
  onCell: (i: number, p: Programme | null, at: number) => void;
}

/** One channel's programmes as TV-box cells (`ProgrammeStripCanvas`, TvBoxNav branch). */
const Strip = memo(function Strip({ index, channel, list, ws, we, now, scrollX, lit, cursor, reminded, onCell, reading }: StripProps) {
  const cells = cellsIn(list, ws, we, scrollX - OVERSCAN_X, scrollX + TIMELINE_W + OVERSCAN_X);
  const top = index * ROW_STEP;
  const focusOn = cursor >= 0 ? programmeAt(list, cursor) : null;
  let gap: [number, number] | null = null;
  if (cursor >= 0 && focusOn === null) {
    const [g0, g1] = gapAround(list, cursor, ws, we);
    const x0 = Math.max(scrollX, pxAt(g0, ws) + 3);
    const x1 = Math.min(scrollX + TIMELINE_W, pxAt(g1, ws) - 3);
    if (x1 > x0) gap = [x0, x1];
  }
  const inView = cells.some((c) => c.x + c.w > scrollX && c.x < scrollX + TIMELINE_W);
  // While the row is read, a quiet bar where its programmes go, so the grid never opens on empty rows (2.5.2).
  if (reading && list.length === 0) {
    return (
      <div class={`gd-row${lit ? " lit" : ""}`} style={{ top: `${top}px` }}>
        {lit ? <div class="gd-bar" style={{ left: `${scrollX}px`, width: `${TIMELINE_W}px` }} /> : null}
        <div class="gd-skel" style={{ left: `${scrollX}px`, width: `${TIMELINE_W}px` }} />
      </div>
    );
  }
  return (
    <div class={`gd-row${lit ? " lit" : ""}`} style={{ top: `${top}px` }}>
      {lit ? <div class="gd-bar" style={{ left: `${scrollX}px`, width: `${TIMELINE_W}px` }} /> : null}
      {gap ? (
        <div class="gd-cell cur gap" style={{ left: `${gap[0]}px`, width: `${gap[1] - gap[0]}px` }}><span class="gd-none">{t("gssNoProgramme")}</span></div>
      ) : null}
      {!inView && !gap ? (
        <div class="gd-cell empty" style={{ left: `${scrollX + 3}px`, width: `${TIMELINE_W - 6}px` }} onClick={() => onCell(index, null, timeAt(scrollX, ws))}>
          <span class="gd-none">{t("gssNoProgramme")}</span>
        </div>
      ) : null}
      {cells.map(({ p, x, w }) => {
        const focused = focusOn === p;
        const isNow = p.start <= now && now < p.stop;
        const past = !focused && p.stop <= now;
        const vx = x - scrollX;
        const tx = Math.max(vx, 0);
        const textW = vx + w - tx - 28;
        const bell = p.start > now && reminded(channel, p);
        const arch = hasArchive(channel, p.start, p.stop, now);
        return (
          <div
            key={p.start} class={`gd-cell${focused ? " cur" : isNow ? " now" : ""}${past ? " past" : ""}`}
            style={{ left: `${x}px`, width: `${w}px` }} onClick={() => onCell(index, p, p.start)}
          >
            {textW > 44 ? (
              <div class="gd-in" style={tx > vx ? { paddingLeft: `${14 + tx - vx}px` } : undefined}>
                <div class="gd-t">{p.title}</div>
                <div class="gd-s">
                  {bell ? <Icon name="bell" size={14} /> : null}
                  {arch ? <Icon name="rewind" size={14} /> : null}
                  <span>{t("gssTimeRange", { a: clock(p.start), b: clock(p.stop) })}</span>
                </div>
              </div>
            ) : w > 8 ? <i class="gd-dot" /> : null}
          </div>
        );
      })}
    </div>
  );
});

/**
 * Hold OK on the grid: the programme menu (`GuideProgrammeMenu`, TV-box: centred, 560 wide), or the channel's when
 * nothing is on at the cursor (`GuideChannelMenu`). Recording and the EPG matching items are not in the web app.
 */
function GuideMenu(p: {
  menu: { channel: Channel; programme: Programme | null }; number: number | undefined; now: number; favorite: boolean; reminded: boolean;
  lead: number;
  onWatch: () => void; onFromStart: (() => void) | null; onRemind: (() => void) | null; onFav: (() => void) | null; onClose: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  useOwnBack(wrap, p.onClose);
  const { channel, programme } = p.menu;
  const name = [p.number, channel.name].filter((x) => x !== undefined && x !== "").join(" ");
  useEffect(() => { focusFirst(wrap.current ?? document, programme && p.onRemind ? "gm-remind" : "gm-watch"); }, []);
  const lead = p.lead === 0 ? t("gssRemindAtStart") : t("gssRemindBefore", { d: t("gssMinutes", { n: p.lead }) });
  const upper = (s: string) => s.toLocaleUpperCase();
  return (
    <div ref={wrap}>
      <Menu
        width={560} onClose={p.onClose}
        title={programme ? programme.title : name.replace(" ", " · ")}
        subtitle={programme ? `${t("gssTimeRange", { a: clock(programme.start), b: clock(programme.stop) })} · ${name}` : t("gssNoProgramme")}
      >
        {programme ? (
          <>
            <div class="st-menu-group">{upper(t("gssGroupNew"))}</div>
            <MenuItem id="gm-remind" icon="bell" text={t(p.reminded ? "gssReminderSet" : "gssRemindMe")} value={p.reminded ? undefined : lead}
              checked={p.reminded} disabled={!p.onRemind} onClick={() => p.onRemind?.()} />
          </>
        ) : null}
        <div class="st-menu-group">{upper(t("gssGroupWatch"))}</div>
        <MenuItem id="gm-watch" icon="live_tv" text={t("gssWatchChannel")} onClick={p.onWatch} />
        {programme ? (
          <MenuItem id="gm-start" icon="rewind" text={t("gssWatchStart")} disabled={!p.onFromStart}
            value={!p.onFromStart && programme.start > p.now ? t("gssAfterTime", { t: clock(programme.start) }) : undefined}
            onClick={() => p.onFromStart?.()} />
        ) : null}
        {p.onFav ? (
          <>
            <div class="st-menu-group">{upper(t("gssGroupChannel"))}</div>
            <MenuItem id="gm-fav" icon="favorite" text={t(p.favorite ? "gssRemoveFav" : "gssAddFav")} onClick={() => p.onFav?.()} />
          </>
        ) : null}
      </Menu>
    </div>
  );
}

export { channelKey };
