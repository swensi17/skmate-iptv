import { useContext } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { t } from "../i18n";
import { GuideContext } from "../state/GuideContext";
import { UiContext } from "../state/UiContext";
import { capitalize } from "../text";
import { ChannelLogo } from "./ChannelLogo";
import { leftLabel } from "./Left";

/** Yellow on webOS (405) and on Tizen (12 once registered); `y` on a keyboard. */
const isYellow = (e: KeyboardEvent) => e.keyCode === 405 || e.keyCode === 12 || e.key === "y";

export function ChannelRow(props: {
  channel: Channel; index: number; favorite: boolean;
  onOpen: (c: Channel) => void; onFav: (c: Channel) => void; onFocus?: (c: Channel) => void;
}) {
  const { channel } = props;
  const { data, now } = useContext(GuideContext);
  const ui = useContext(UiContext);
  const { now: on, progress } = ui.program ? data.nowNext(channel.id, now) : { now: null, progress: 0 };
  return (
    <button
      class={ui.logos ? "row has-logo" : "row"} data-focus={`ch-${channel.id}`}
      onClick={() => props.onOpen(channel)}
      onFocus={() => props.onFocus?.(channel)}
      onKeyDown={(e) => { if (isYellow(e as unknown as KeyboardEvent)) props.onFav(channel); }}
    >
      {ui.logos ? <ChannelLogo channel={channel} /> : null}
      {ui.numbers ? <span class="num">{props.index + 1}</span> : null}
      <span class="grow two">
        <span class="nm">{channel.name}</span>
        {on ? (
          <>
            <span class="prog">{on.title}<span class="left"> · {leftLabel(on.stop, now)}</span></span>
            <span class="bar row-bar"><span class="bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} /></span>
          </>
        ) : null}
      </span>
      {props.favorite ? <span class="star">★</span> : null}
      {channel.catchupDays ? <span class="tag">{t("archiveDays", { n: channel.catchupDays })}</span> : null}
      {on ? null : channel.group ? <span class="sub">{capitalize(channel.group)}</span> : null}
    </button>
  );
}
