import { useContext, useEffect, useRef, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { focusFirst, Icon, Presence } from "@skmate/ui";
import { t } from "../i18n";
import { GuideContext } from "../state/GuideContext";
import { UiContext } from "../state/UiContext";
import { ChannelLogo } from "./ChannelLogo";
import { ChannelMenu, ChannelSchedule } from "./ChannelMenu";
import { leftLabel } from "./Left";
import "./channel.css";

/** Yellow on webOS (405) and on Tizen (12 once registered); `y` on a keyboard. */
const isYellow = (e: KeyboardEvent) => e.keyCode === 405 || e.keyCode === 12 || e.key === "y";
const isEnter = (e: KeyboardEvent) => e.key === "Enter" || e.keyCode === 13;
/** OK held this long opens the channel's menu instead of the channel. */
const LONG_MS = 600;

/** The archive in few words: "3 дн." (the word "archive" is dropped; the clock beside it says it), the unit as the language writes it. */
function archiveShort(n: number): string {
  const s = t("archiveDays", { n });
  const at = s.search(/\d/);
  return at > 0 ? s.slice(at) : s;
}

/**
 * One channel in a list. OK opens it; OK held (or a right click) opens its menu: favourite, watch, programme.
 * The yellow key still toggles the favourite.
 */
export function ChannelRow(props: {
  channel: Channel; index: number; favorite: boolean;
  onOpen: (c: Channel) => void; onFav: (c: Channel) => void; onFocus?: (c: Channel) => void;
  /** The channel on the screen now: marked with a play sign in the player's list. */
  playing?: boolean;
  /** "Programme" in the menu: a list with a day column beside it shows it there; without this, a sheet opens. */
  onSchedule?: (c: Channel) => void;
}) {
  const { channel } = props;
  const { data, now } = useContext(GuideContext);
  const ui = useContext(UiContext);
  const { now: on, progress } = ui.program ? data.nowNext(channel.id, now) : { now: null, progress: 0 };

  // OK is taken on its release: a short press opens the channel, a long one (the timer fires first) the menu.
  const [layer, setLayer] = useState<null | "menu" | "schedule">(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => { if (press.current !== null) clearTimeout(press.current); press.current = null; };
  useEffect(() => cancel, []);
  const close = (refocus = true) => {
    setLayer(null);
    if (refocus) setTimeout(() => focusFirst(document, `ch-${channel.id}`), 0);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (isYellow(e)) { props.onFav(channel); return; }
    if (!isEnter(e)) return;
    e.preventDefault(); // no click on the press: the release decides
    if (press.current !== null || layer !== null) return; // a held key repeats
    // Held long enough: the menu, and this press is spent (its release lands in the menu, or nowhere).
    press.current = setTimeout(() => { press.current = null; setLayer("menu"); }, LONG_MS);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!isEnter(e)) return;
    const pending = press.current !== null;
    cancel();
    if (pending) props.onOpen(channel);
  };

  return (
    <>
      <button
        class="row ch" data-focus={`ch-${channel.id}`}
        onClick={() => props.onOpen(channel)}
        onFocus={() => props.onFocus?.(channel)}
        onBlur={cancel}
        onKeyDown={onKeyDown as unknown as (e: Event) => void}
        onKeyUp={onKeyUp as unknown as (e: Event) => void}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setLayer("menu"); }}
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
      <Presence show={layer === "menu"}>
        {(out) => (
          <ChannelMenu
            channel={channel} favorite={props.favorite} closing={out} onClose={() => close()}
            onFav={() => { props.onFav(channel); close(); }}
            onWatch={() => { close(false); props.onOpen(channel); }}
            onSchedule={() => {
              if (props.onSchedule) { close(false); props.onSchedule(channel); } else setLayer("schedule");
            }}
          />
        )}
      </Presence>
      <Presence show={layer === "schedule"}>
        {(out) => (
          <ChannelSchedule channel={channel} closing={out} onClose={() => close()} onWatch={() => { close(false); props.onOpen(channel); }} />
        )}
      </Presence>
    </>
  );
}
