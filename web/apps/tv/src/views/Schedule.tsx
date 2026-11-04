import { useContext, useEffect, useRef } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { GuideContext } from "../state/GuideContext";
import { capitalize } from "../text";
import { leftLabel } from "./Left";

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * The middle column of the player's channel list: what is on the channel the cursor is on, and the day ahead of it.
 * Read only (the remote walks the list on its left); the programme on now is lit and kept in view.
 */
export function Schedule({ channel }: { channel: Channel | null }) {
  const { data, now } = useContext(GuideContext);
  const box = useRef<HTMLDivElement>(null);
  const items = channel ? data.of(channel.id) : [];
  const live = items.find((x) => x.start <= now && now < x.stop) ?? null;
  const from = items.findIndex((x) => x.stop > now - 30 * 60_000);
  const shown = from < 0 ? [] : items.slice(Math.max(0, from), Math.max(0, from) + 40);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>(".sc-now")?.scrollIntoView({ block: "center" });
  }, [channel?.id, shown.length]);

  if (!channel) return <div class="tm-sched" />;
  return (
    <div class="tm-sched">
      <div class="sc-head">
        <div class="sc-name">{channel.name}</div>
        {channel.group ? <div class="sc-group">{capitalize(channel.group)}</div> : null}
      </div>
      {live ? (
        <div class="sc-card">
          <div class="sc-title">{live.title}</div>
          <div class="sc-time">{clock(live.start)} – {clock(live.stop)} · {leftLabel(live.stop, now)}</div>
          <span class="bar"><span class="bar-fill" style={{ width: `${Math.round(Math.min(1, Math.max(0, (now - live.start) / (live.stop - live.start))) * 100)}%` }} /></span>
          {live.desc ? <div class="sc-desc">{live.desc}</div> : null}
        </div>
      ) : null}
      <div class="sc-list" ref={box}>
        {shown.map((x) => (
          <div class={`sc-row${x === live ? " sc-now" : ""}`} key={x.start}>
            <span class="sc-at">{clock(x.start)}</span>
            <span class="sc-t">{x.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
