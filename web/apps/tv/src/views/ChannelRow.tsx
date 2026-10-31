import type { Channel } from "@skmate/core";
import { capitalize } from "../text";

/** Yellow on webOS (405) and on Tizen (12 once registered); `y` on a keyboard. */
const isYellow = (e: KeyboardEvent) => e.keyCode === 405 || e.keyCode === 12 || e.key === "y";

export function ChannelRow(props: { channel: Channel; index: number; favorite: boolean; onOpen: (c: Channel) => void; onFav: (c: Channel) => void }) {
  const { channel } = props;
  return (
    <button
      class="row" data-focus={`ch-${channel.id}`}
      onClick={() => props.onOpen(channel)}
      onKeyDown={(e) => { if (isYellow(e as unknown as KeyboardEvent)) props.onFav(channel); }}
    >
      <span class="sub" style={{ width: 56, textAlign: "right" }}>{props.index + 1}</span>
      {channel.logo ? <img class="logo" src={channel.logo} alt="" /> : <span class="logo" />}
      <span class="grow">{channel.name}</span>
      {props.favorite ? <span class="star">★</span> : null}
      {channel.group ? <span class="sub">{capitalize(channel.group)}</span> : null}
    </button>
  );
}
