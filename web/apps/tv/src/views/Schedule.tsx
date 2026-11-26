import { useContext, useEffect, useRef, useState } from "preact/hooks";
import type { Programme } from "@skmate/epg";
import { archiveUrl, type Channel } from "@skmate/core";
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

/**
 * The block under the docked picture in the player's channel panel (TvBoxChannelPanel.kt:248-304): the focused
 * channel (logo, number, name) and its day — the programme before, the one on air, then what comes — at most 14 rows
 * of 50. It only shows: OK in the panel watches the channel. It follows the focus once it rests (120 ms for the
 * header, 250 ms for the day), so a held key does not lay out every row it passes.
 */
export function PanelSchedule({ channel, number, now }: { channel: Channel | null; number: number | null; now: number }) {
  const { data } = useContext(GuideContext);
  const [head, setHead] = useState<{ c: Channel; n: number | null } | null>(channel ? { c: channel, n: number } : null);
  const [day, setDay] = useState<Channel | null>(channel);
  useEffect(() => {
    if (!channel) return;
    const a = setTimeout(() => setHead({ c: channel, n: number }), head ? 120 : 0);
    const b = setTimeout(() => setDay(channel), 250);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [channel?.id]);
  if (!head) return null;
  const items = day ? data.of(day.id) : [];
  const at = items.findIndex((x) => x.stop > now);
  const from = at < 0 ? -1 : Math.max(0, at - 1);
  const shown = from < 0 || day?.id !== head.c.id ? [] : items.slice(from, from + 14);
  return (
    <>
      <div class="tp-head">
        <span class="tp-row-logo"><ChannelLogo channel={head.c} /></span>
        {head.n !== null ? <span class="n">{head.n}</span> : null}
        <span class="t">{head.c.name}</span>
      </div>
      {day?.id === head.c.id && shown.length === 0 ? <div class="tp-none">{t("tbNoGuideShort")}</div> : (
        <div class="tp-day">
          {shown.map((x) => {
            const on = x.start <= now && now < x.stop;
            const past = x.stop <= now;
            return (
              <div class={`tp-p${on ? " on" : past ? " past" : ""}`} key={x.start}>
                <span class="tp-p-time">{t("tbRange", { a: clock(x.start), b: clock(x.stop) })}</span>
                <span class="tp-p-title">{x.title}</span>
                {on ? <span class="tp-p-bar"><i style={{ width: `${Math.round(Math.min(1, (now - x.start) / Math.max(1, x.stop - x.start)) * 100)}%` }} /></span> : null}
                {on ? <span class="tp-p-left">{t("tbTimeLeft", { t: t("tbMinutes", { n: Math.max(0, Math.floor((x.stop - now) / 60_000)) }) })}</span> : null}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
