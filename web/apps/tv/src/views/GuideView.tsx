import { useContext, useEffect, useMemo, useState } from "preact/hooks";
import { hasArchive, type Channel } from "@skmate/core";
import { focusFirst, Icon, VirtualList } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import { GuideContext } from "../state/GuideContext";
import type { GuideStatus } from "../state/useGuide";
import { clock, floorHalfHour } from "../time";
import type { Settings } from "../state/settings";
import { ChannelLogo } from "./ChannelLogo";
import { PreviewVideo } from "./PreviewPane";
import { leftLabel } from "./Left";
import { capitalize } from "../text";
import type { Programme } from "@skmate/epg";

const ROW = 76;
const LIST_HEIGHT = 608; // from under the time scale to the foot of the screen
const NAME_W = 380;
const TIMELINE_W = 1400;
const PREVIEW_DWELL_MS = 700;
const SPAN_MS = 3 * 3_600_000;
const SHIFT_MS = 3 * 3_600_000;
const MIN_TEXT_W = 90;

interface Props {
  settings: Settings;
  channels: Channel[];
  favorites: ReadonlySet<string>;
  status: GuideStatus;
  onRefresh: () => void;
  onOpen: (c: Channel, list: readonly Channel[]) => void;
  /** A past programme on a channel that keeps a recording of it. */
  onArchive: (c: Channel, p: Programme, list: readonly Channel[]) => void;
  /** A programme still to come: watch the channel or be reminded (see Reminders.tsx). */
  onUpcoming: (c: Channel, p: Programme, list: readonly Channel[]) => void;
  /** Whether a reminder is set for that programme (a bell on it). */
  reminded: (c: Channel, p: Programme) => boolean;
}

/** The guide: channels down the side, three hours of programmes across, the one in focus described below. */
export function GuideView({ settings, channels, favorites, status, onRefresh, onOpen, onArchive, onUpcoming, reminded }: Props) {
  const { data, now } = useContext(GuideContext);
  const [from, setFrom] = useState(() => floorHalfHour(Date.now() - 30 * 60_000));
  const [sel, setSel] = useState<{ channel: Channel; programme: Programme } | null>(null);
  const rows = useMemo(() => channels.filter((c) => data.of(c.id).length > 0), [channels, data]);

  // The picture of the channel under the cursor starts only when the cursor has rested, so walking down the rows opens nothing.
  const [watching, setWatching] = useState<Channel | null>(null);
  const focused = sel?.channel ?? rows[0] ?? null;
  useEffect(() => {
    if (!focused) return;
    const id = setTimeout(() => setWatching(focused), PREVIEW_DWELL_MS);
    return () => clearTimeout(id);
  }, [focused?.id]);

  useEffect(() => { focusFirst(document, rows[0] ? `pg-${rows[0].id}-name` : "guide-refresh"); }, [rows.length === 0]);
  void favorites;

  const x = (ms: number) => ((ms - from) / SPAN_MS) * TIMELINE_W;
  const nowX = x(now);
  const marks: number[] = [];
  for (let m = from; m < from + SPAN_MS; m += 30 * 60_000) marks.push(m);

  const empty = rows.length === 0;
  const shown = sel?.programme ?? (focused ? data.nowNext(focused.id, now).now : null);
  const total = shown ? shown.stop - shown.start : 0;
  const done = shown && total > 0 ? Math.min(1, Math.max(0, (now - shown.start) / total)) : 0;
  const live = shown !== null && shown.start <= now && now < shown.stop;
  return (
    <div class="screen guide">
      <div class="gtop">
        <div class="gtop-video">
          {watching && settings.preview ? <PreviewVideo key={watching.url} channel={watching} settings={settings} /> : <div class="preview-empty"><Icon name="live_tv" size={72} /></div>}
        </div>
        <div class="gtop-info">
          <div class="gtop-bar">
            <div class="gtop-chan">{focused ? <span class="gtop-name">{focused.name}</span> : null}{focused?.group ? <span class="gtop-group">{capitalize(focused.group)}</span> : null}</div>
            <div class="toolbar">
              <button class="btn tool" data-focus="guide-back" onClick={() => setFrom((f) => f - SHIFT_MS)}>{t("guideBack")}</button>
              <button class="btn tool" data-focus="guide-now" onClick={() => setFrom(floorHalfHour(Date.now() - 30 * 60_000))}>{t("guideNow")}</button>
              <button class="btn tool" data-focus="guide-fwd" onClick={() => setFrom((f) => f + SHIFT_MS)}>{t("guideForward")}</button>
              <button class="btn tool" data-focus="guide-refresh" onClick={onRefresh} aria-label={t("guideRefresh")}>
                <Icon name="refresh" size={26} />{status.kind === "syncing" ? ` ${status.text}` : ""}
              </button>
            </div>
          </div>
          {shown ? (
            <>
              <div class="gtop-title">{shown.title}</div>
              <div class="gtop-time">
                {clock(shown.start)} – {clock(shown.stop)}
                {live ? <><span class="bar gtop-prog"><span class="bar-fill" style={{ width: `${Math.round(done * 100)}%` }} /></span>{leftLabel(shown.stop, now)}</> : null}
                {sel && hasArchive(sel.channel, shown.start, shown.stop, now) ? <span class="gtop-arch"><Icon name="history" size={22} /></span> : null}
              </div>
              <div class="gtop-desc">{shown.desc ?? ""}</div>
            </>
          ) : <div class="gtop-title dim">{t("scheduleNone")}</div>}
        </div>
      </div>

      {empty ? (
        <div class="empty guide-empty">
          <div class="empty-title">{status.kind === "syncing" ? t("guideLoading") : t("guideEmptyTitle")}</div>
          <div class="empty-hint">{status.kind === "syncing" ? status.text : t("guideEmptyHint")}</div>
        </div>
      ) : (
        <>
          <div class="guide-scale" style={{ paddingLeft: `${NAME_W}px`, width: `${NAME_W + TIMELINE_W}px` }}>
            <span class="gs-now">{new Date(now).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
            {marks.map((m) => <span class="mark" key={m} style={{ left: `${NAME_W + x(m)}px` }}>{clock(m)}</span>)}
          </div>
          <div class="guide-body" style={{ width: `${NAME_W + TIMELINE_W}px` }}>
            <VirtualList
              items={rows} rowHeight={ROW} height={LIST_HEIGHT} pageSize={8}
              idOf={(c) => `pg-${c.id}`}
              renderRow={(c, i) => {
                // The day of the channel cut to the window; what the guide does not cover is a quiet "no guide" cell, as on a box.
                const items = data.of(c.id).filter((p) => p.stop > from && p.start < from + SPAN_MS);
                const gaps: Array<[number, number]> = [];
                let at = from;
                for (const p of items) { if (p.start > at) gaps.push([at, p.start]); at = Math.max(at, p.stop); }
                if (at < from + SPAN_MS) gaps.push([at, from + SPAN_MS]);
                return (
                <div class="grow-row">
                  <button class="gname" data-focus={`pg-${c.id}-name`} style={{ width: `${NAME_W - 12}px` }} onClick={() => onOpen(c, rows)}>
                    <span class="gnum">{i + 1}</span>
                    <ChannelLogo channel={c} />
                    <span class="grow nm">{c.name}</span>
                  </button>
                  <div class="gline" style={{ left: `${NAME_W}px`, width: `${TIMELINE_W}px` }}>
                    {gaps.map(([g0, g1]) => (
                      <div class="block gap" key={`g${g0}`} style={{ left: `${Math.max(0, x(g0))}px`, width: `${Math.max(8, Math.min(TIMELINE_W, x(g1)) - Math.max(0, x(g0)) - 4)}px` }}>
                        <span class="block-t">{t("scheduleNone")}</span>
                      </div>
                    ))}
                    {items.map((p) => {
                      const left = Math.max(0, x(p.start));
                      const width = Math.min(TIMELINE_W, x(p.stop)) - left - 4;
                      const isLive = p.start <= now && now < p.stop;
                      const recorded = hasArchive(c, p.start, p.stop, now);
                      const upcoming = p.start > now;
                      return (
                        <button
                          class={`block${isLive ? " onair" : ""}${recorded ? " arch" : ""}${upcoming && reminded(c, p) ? " rem" : ""}`} key={p.start} data-focus={`pg-${c.id}-${p.start}`}
                          style={{ left: `${left}px`, width: `${Math.max(8, width)}px` }}
                          onFocus={() => setSel({ channel: c, programme: p })}
                          onClick={() => (recorded ? onArchive(c, p, rows) : upcoming ? onUpcoming(c, p, rows) : onOpen(c, rows))}
                        >
                          {upcoming && reminded(c, p) ? <span class="bell"><Icon name="bell" size={20} /></span> : null}
                          {width >= MIN_TEXT_W ? <span class="block-t">{p.title}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
                );
              }}
            />
            {nowX >= 0 && nowX <= TIMELINE_W ? <div class="nowline" style={{ left: `${NAME_W + nowX}px`, height: `${LIST_HEIGHT}px` }} /> : null}
          </div>
        </>
      )}
    </div>
  );
}

export { channelKey };
