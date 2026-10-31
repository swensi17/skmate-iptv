import { useContext } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { GuideContext } from "../state/GuideContext";
import { capitalize } from "../text";
import { ChannelLogo } from "./ChannelLogo";

/** Yellow on webOS (405) and on Tizen (12 once registered); `y` on a keyboard. */
const isYellow = (e: KeyboardEvent) => e.keyCode === 405 || e.keyCode === 12 || e.key === "y";

export function ChannelRow(props: {
  channel: Channel; index: number; favorite: boolean;
  onOpen: (c: Channel) => void; onFav: (c: Channel) => void; onFocus?: (c: Channel) => void;
}) {
  const { channel } = props;
  const { data, now } = useContext(GuideContext);
  const { now: on, progress } = data.nowNext(channel.id, now);
  return (
    <button
      class="row" data-focus={`ch-${channel.id}`}
      onClick={() => props.onOpen(channel)}
      onFocus={() => props.onFocus?.(channel)}
      onKeyDown={(e) => { if (isYellow(e as unknown as KeyboardEvent)) props.onFav(channel); }}
    >
      <span class="sub" style={{ width: 56, textAlign: "right" }}>{props.index + 1}</span>
      <ChannelLogo channel={channel} />
      <span class="grow two">
        <span class="nm">{channel.name}</span>
        {on ? (
          <>
            <span class="prog">{on.title}</span>
            <span class="bar"><span class="bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} /></span>
          </>
        ) : null}
      </span>
      {props.favorite ? <span class="star">★</span> : null}
      {on ? null : channel.group ? <span class="sub">{capitalize(channel.group)}</span> : null}
    </button>
  );
}
