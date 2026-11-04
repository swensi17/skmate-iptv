import { useContext, useEffect, useRef, useState } from "preact/hooks";
import type { Programme } from "@skmate/epg";
import type { Channel } from "@skmate/core";
import { t } from "../i18n";
import { GuideContext } from "../state/GuideContext";
import { capitalize } from "../text";
import { leftLabel } from "./Left";

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * The column beside the player's channel list: what is on the channel the cursor is on, and the day ahead of it. Right
 * from the list walks into it, Up and Down go through the programmes (the card above shows the one under the cursor),
 * Left goes back. A channel without a guide says so, over a few quiet placeholder lines.
 */
export function Schedule({ channel }: { channel: Channel | null }) {
  const { data, now } = useContext(GuideContext);
  const box = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<Programme | null>(null);
  const items = channel ? data.of(channel.id) : [];
  const live = items.find((x) => x.start <= now && now < x.stop) ?? null;
  const from = items.findIndex((x) => x.stop > now - 30 * 60_000);
  const shown = from < 0 ? [] : items.slice(from, from + 40);

  useEffect(() => { setPicked(null); }, [channel?.id]);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>(".sc-now")?.scrollIntoView({ block: "center" });
  }, [channel?.id, shown.length]);

  if (!channel) return <div class="tm-sched" />;
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
              <button class={`sc-row${x === live ? " sc-now" : ""}`} key={x.start} data-focus={`sc-${i}`} onFocus={() => setPicked(x)} tabIndex={-1}>
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
