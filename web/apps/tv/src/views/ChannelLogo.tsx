import { useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { hueOf, monogram } from "../text";

/** The channel's own logo; when the playlist has none (or it does not load) a coloured badge with its letters. */
export function ChannelLogo({ channel }: { channel: Channel }) {
  const [broken, setBroken] = useState(false);
  if (channel.logo && !broken) return <img class="logo" src={channel.logo} alt="" loading="lazy" onError={() => setBroken(true)} />;
  return <span class="logo badge" style={{ "--h": String(hueOf(channel.name)) }} aria-hidden="true">{monogram(channel.name)}</span>;
}
