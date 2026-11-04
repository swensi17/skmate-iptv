import { useContext } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { Icon } from "@skmate/ui";
import { t } from "../i18n";
import { GuideContext } from "../state/GuideContext";
import { UiContext } from "../state/UiContext";
import { ChannelLogo } from "./ChannelLogo";
import { leftLabel } from "./Left";

/** Yellow on webOS (405) and on Tizen (12 once registered); `y` on a keyboard. */
const isYellow = (e: KeyboardEvent) => e.keyCode === 405 || e.keyCode === 12 || e.key === "y";

/** The archive in few words: "3 дн." (the word "archive" is dropped; the clock beside it says it), the unit as the language writes it. */
function archiveShort(n: number): string {
  const s = t("archiveDays", { n });
  const at = s.search(/\d/);
  return at > 0 ? s.slice(at) : s;
}

export function ChannelRow(props: {
  channel: Channel; index: number; favorite: boolean;
  onOpen: (c: Channel) => void; onFav: (c: Channel) => void; onFocus?: (c: Channel) => void;
  /** The channel on the screen now: marked with a play sign in the player's list. */
  playing?: boolean;
}) {
  const { channel } = props;
  const { data, now } = useContext(GuideContext);
  const ui = useContext(UiContext);
  const { now: on, progress } = ui.program ? data.nowNext(channel.id, now) : { now: null, progress: 0 };
  return (
    <button
      class="row" data-focus={`ch-${channel.id}`}
      onClick={() => props.onOpen(channel)}
      onFocus={() => props.onFocus?.(channel)}
      onKeyDown={(e) => { if (isYellow(e as unknown as KeyboardEvent)) props.onFav(channel); }}
    >
      {ui.numbers ? <span class="num">{props.index + 1}</span> : null}
      {ui.logos ? <ChannelLogo channel={channel} /> : null}
      <span class="grow two">
        <span class="nm">{channel.name}</span>
        {on ? (
          <>
            <span class="prog">{on.title}<span class="left"> · {leftLabel(on.stop, now)}</span></span>
            <span class="bar"><span class="bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} /></span>
          </>
        ) : null}
      </span>
      {/* The right edge: a sign that this channel is on the screen in the top corner, the archive under it. No category tag. */}
      {props.playing || props.favorite || channel.catchupDays ? (
        <span class="redge">
          <span class="rtop">
            {props.favorite ? <span class="star">★</span> : null}
            {props.playing ? <span class="now-mark" aria-hidden="true"><Icon name="play" size={22} /></span> : null}
          </span>
          {channel.catchupDays ? <span class="tag"><Icon name="history" size={18} />{archiveShort(channel.catchupDays)}</span> : null}
        </span>
      ) : null}
    </button>
  );
}
