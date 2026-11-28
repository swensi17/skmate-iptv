import { useContext, useEffect, useState } from "preact/hooks";
import { logoGate } from "@skmate/ui";
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
  // A logo starts loading only once the list has stood still (see logoGate); until then the badge / grey holds its place.
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!src) return;
    const cancel = logoGate.request(src, () => setArmed(src));
    return () => { cancel(); logoGate.done(src, false); };
  }, [src]);
  const ready = !!src && (armed === src || logoGate.isSeen(src));
  const finish = (ok: boolean) => logoGate.done(src as string, ok);
  if (tile) {
    const show = !!src && broken !== src;
    return (
      <span class={`logo-tile${show ? (loaded === src ? "" : " wait") : " none"}`} aria-hidden="true">
        {show
          ? (ready ? <img src={src} alt="" decoding="async" onLoad={() => { finish(true); setLoaded(src); }} onError={() => { finish(false); setBroken(src); }} /> : null)
          : <StageIcon name="tv" size={24} />}
      </span>
    );
  }
  if (src && ready && broken !== src) {
    return <img class="logo" src={src} alt="" decoding="async" onLoad={() => finish(true)} onError={() => { finish(false); setBroken(src); }} />;
  }
  return <span class="logo badge" style={{ "--h": String(hueOf(channel.name)) }} aria-hidden="true">{monogram(channel.name)}</span>;
}
