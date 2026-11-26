import { useContext, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { GuideContext } from "../state/GuideContext";
import { hueOf, monogram } from "../text";
import { StageIcon } from "./GroupIcon";

/**
 * The channel's logo: its own (`tvg-logo`), else the one the programme guide gives it; when there is none, or it does
 * not load, a coloured badge with the channel's letters.
 *
 * [tile]: Android's logo plate (LiveStage.kt LivePlate on ui/components/ChannelLogoTile.kt): the logo keeps its own
 * transparency (no white plate), a soft grey stands in while it loads, and a channel without one shows the TV glyph
 * (78% of the plate's height, dim) on the control grey. The box is sized by its parent's CSS (`.logo-tile`).
 */
export function ChannelLogo({ channel, tile }: { channel: Channel; tile?: boolean }) {
  const { data } = useContext(GuideContext);
  const [broken, setBroken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const src = channel.logo ?? data.logoOf(channel.id);
  if (tile) {
    const show = !!src && broken !== src;
    return (
      <span class={`logo-tile${show ? (loaded === src ? "" : " loading") : " none"}`} aria-hidden="true">
        {show
          ? <img src={src} alt="" decoding="async" onLoad={() => setLoaded(src)} onError={() => setBroken(src)} />
          : <StageIcon name="tv" size={24} />}
      </span>
    );
  }
  if (src && broken !== src) {
    return <img class="logo" src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(src)} />;
  }
  return <span class="logo badge" style={{ "--h": String(hueOf(channel.name)) }} aria-hidden="true">{monogram(channel.name)}</span>;
}
