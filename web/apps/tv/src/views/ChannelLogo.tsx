import { useContext, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { GuideContext } from "../state/GuideContext";
import { hueOf, monogram } from "../text";

/**
 * The channel's logo: its own (`tvg-logo`), else the one the programme guide gives it; when there is none, or it does
 * not load, a coloured badge with the channel's letters.
 */
export function ChannelLogo({ channel }: { channel: Channel }) {
  const { data } = useContext(GuideContext);
  const [broken, setBroken] = useState<string | null>(null);
  const src = channel.logo ?? data.logoOf(channel.id);
  if (src && broken !== src) {
    return <img class="logo" src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(src)} />;
  }
  return <span class="logo badge" style={{ "--h": String(hueOf(channel.name)) }} aria-hidden="true">{monogram(channel.name)}</span>;
}
