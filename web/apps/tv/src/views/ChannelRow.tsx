import type { Channel } from "@skmate/core";

export function ChannelRow({ channel, index, onOpen }: { channel: Channel; index: number; onOpen: (c: Channel) => void }) {
  return (
    <button class="row" data-focus={`ch-${channel.id}`} onClick={() => onOpen(channel)}>
      <span class="sub" style={{ width: 56, textAlign: "right" }}>{index + 1}</span>
      {channel.logo ? <img class="logo" src={channel.logo} alt="" /> : <span class="logo" />}
      <span class="grow">{channel.name}</span>
      {channel.group ? <span class="sub">{channel.group}</span> : null}
    </button>
  );
}
