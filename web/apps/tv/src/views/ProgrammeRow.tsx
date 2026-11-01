import { useContext } from "preact/hooks";
import { hasArchive, type Channel } from "@skmate/core";
import type { Programme } from "@skmate/epg";
import { t } from "../i18n";
import { GuideContext } from "../state/GuideContext";
import { clock } from "../time";
import { ChannelLogo } from "./ChannelLogo";
import { leftLabel, startsInLabel } from "./Left";

/** A programme found in the guide: its title, the channel and time under it, "on now" or "in 25 min" at the end. */
export function ProgrammeRow(p: { channel: Channel; programme: Programme; onOpen: (c: Channel, programme: Programme) => void }) {
  const { now } = useContext(GuideContext);
  const live = p.programme.start <= now && now < p.programme.stop;
  // Over, and kept by the provider: it opens from its recording.
  const recorded = hasArchive(p.channel, p.programme.start, p.programme.stop, now);
  const progress = live ? Math.min(1, (now - p.programme.start) / Math.max(1, p.programme.stop - p.programme.start)) : 0;
  return (
    <button class="row" data-focus={`pr-${p.channel.id}-${p.programme.start}`} onClick={() => p.onOpen(p.channel, p.programme)}>
      <ChannelLogo channel={p.channel} />
      <span class="grow two">
        <span class="nm">{p.programme.title}</span>
        <span class="prog">
          {p.channel.name} · {clock(p.programme.start)}–{clock(p.programme.stop)}
          {live ? <span class="left"> · {leftLabel(p.programme.stop, now)}</span> : null}
        </span>
        {live ? <span class="bar"><span class="bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} /></span> : null}
      </span>
      <span class={`tag${live ? " live" : recorded ? " arch" : ""}`}>{live ? t("tagLive") : recorded ? t("tagArchive") : startsInLabel(p.programme.start, now)}</span>
    </button>
  );
}
