import { useContext } from "preact/hooks";
import type { Channel } from "@skmate/core";
import type { Programme } from "@skmate/epg";
import { t } from "../i18n";
import { GuideContext } from "../state/GuideContext";
import { clock } from "../time";
import { ChannelLogo } from "./ChannelLogo";
import { leftLabel, startsInLabel } from "./Left";

/** A programme found in the guide: its title, the channel and time under it, "on now" or "in 25 min" at the end. */
export function ProgrammeRow(p: { channel: Channel; programme: Programme; onOpen: (c: Channel) => void }) {
  const { now } = useContext(GuideContext);
  const live = p.programme.start <= now && now < p.programme.stop;
  const progress = live ? Math.min(1, (now - p.programme.start) / Math.max(1, p.programme.stop - p.programme.start)) : 0;
  return (
    <button class="row" data-focus={`pr-${p.channel.id}-${p.programme.start}`} onClick={() => p.onOpen(p.channel)}>
      <ChannelLogo channel={p.channel} />
      <span class="grow two">
        <span class="nm">{p.programme.title}</span>
        <span class="prog">
          {p.channel.name} · {clock(p.programme.start)}–{clock(p.programme.stop)}
          {live ? <span class="left"> · {leftLabel(p.programme.stop, now)}</span> : null}
        </span>
        {live ? <span class="bar"><span class="bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} /></span> : null}
      </span>
      <span class={`tag${live ? " live" : ""}`}>{live ? t("tagLive") : startsInLabel(p.programme.start, now)}</span>
    </button>
  );
}
