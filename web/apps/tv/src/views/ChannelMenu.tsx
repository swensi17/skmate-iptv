import { createPortal } from "preact/compat";
import { useEffect, useRef } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { Drawer, focusFirst, Icon, isBack } from "@skmate/ui";
import { t } from "../i18n";
import { ChannelLogo } from "./ChannelLogo";
import { Schedule } from "./Schedule";
import "./channel.css";

/** Where the layers go: the stage itself, so they cover the whole screen whatever list the row sits in. */
const stage = (): HTMLElement => document.getElementById("app") ?? document.body;

/**
 * While a layer of a channel row is up, the remote is its own, before any screen's handler: those listen on the
 * document (the player, the lists, the app's Back), this one on the window, which hears a key first. Back closes the
 * layer; Up and Down walk its controls in order; OK presses the focused one, but not while the long press that opened
 * the layer is still held (its repeats would press the first item at once).
 */
function useLayerKeys(root: { current: HTMLElement | null }, onBack: () => void) {
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    let armed = false;
    let lastEnter = Date.now();
    const isEnter = (e: KeyboardEvent) => e.key === "Enter" || e.keyCode === 13;
    const onDown = (e: KeyboardEvent) => {
      const box = root.current;
      if (!box || box.classList.contains("out")) return; // a layer on its way out leaves the keys to the next one
      e.stopPropagation();
      if (isBack(e)) { e.preventDefault(); back.current(); return; }
      if (isEnter(e)) {
        const now = Date.now();
        if (!armed && now - lastEnter < 400) { lastEnter = now; e.preventDefault(); return; } // still the held press
        armed = true;
        return; // the browser presses the focused button
      }
      armed = true;
      const dir = e.key === "ArrowUp" || e.keyCode === 38 ? -1 : e.key === "ArrowDown" || e.keyCode === 40 ? 1 : 0;
      if (dir !== 0 || e.key === "ArrowLeft" || e.key === "ArrowRight" || e.keyCode === 37 || e.keyCode === 39) e.preventDefault();
      if (dir === 0) return;
      const all = Array.from(box.querySelectorAll<HTMLElement>("[data-focus]"));
      const at = all.indexOf(document.activeElement as HTMLElement);
      all[at < 0 ? 0 : Math.max(0, Math.min(all.length - 1, at + dir))]?.focus();
    };
    const onUp = (e: KeyboardEvent) => { const box = root.current; if (!box || box.classList.contains("out")) return; if (isEnter(e)) armed = true; e.stopPropagation(); };
    const onContext = (e: MouseEvent) => { const box = root.current; if (!box || box.classList.contains("out")) return; e.preventDefault(); e.stopPropagation(); back.current(); };
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    window.addEventListener("contextmenu", onContext, true);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("contextmenu", onContext, true);
    };
  }, []);
}

/**
 * The menu of one channel, opened by a long OK on its row: favourite on or off, watch, its programme. As Android's
 * channel menu (live/LiveScreen.kt ChannelContextMenu): a menu card (StageMenu, 640 wide) in the middle of the screen
 * over the wash, the logo and the name on top, one line per action.
 */
export function ChannelMenu(p: {
  channel: Channel; favorite: boolean; closing: boolean;
  onFav: () => void; onWatch: () => void; onSchedule: () => void; onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayerKeys(root, p.onClose);
  useEffect(() => { focusFirst(root.current ?? document, "cm-fav"); }, []);
  return createPortal(
    <div class={`ch-menu${p.closing ? " out" : ""}`} ref={root} data-modal={p.closing ? undefined : ""} onClick={p.onClose}>
      <div class="st-menu ch-menu-panel" role="dialog" aria-label={p.channel.name} onClick={(e) => e.stopPropagation()}>
        <div class="st-menu-head ch-menu-head">
          <span class="st-menu-lead"><ChannelLogo channel={p.channel} /></span>
          <span class="st-menu-title ch-menu-name">{p.channel.name}</span>
        </div>
        {/* LiveScreen.kt ChannelContextMenu: the WATCH group, favourite first («Добавить в избранное» / «Удалить из избранного»). */}
        <div class="st-menu-group">{t("homeMenuWatch").toUpperCase()}</div>
        <button class="st-focusable st-menu-item" data-focus="cm-fav" aria-pressed={p.favorite} onClick={p.onFav}>
          <Icon name="favorite" size={28} /><span class="st-menu-item-text">{t(p.favorite ? "homeRemoveFavourite" : "homeAddFavourite")}</span>
        </button>
        <button class="st-focusable st-menu-item" data-focus="cm-watch" onClick={p.onWatch}>
          <Icon name="play" size={28} /><span class="st-menu-item-text">{t("remindWatch")}</span>
        </button>
        <button class="st-focusable st-menu-item" data-focus="cm-epg" onClick={p.onSchedule}>
          <Icon name="epg" size={28} /><span class="st-menu-item-text">{t("navGuide")}</span>
        </button>
      </div>
    </div>,
    stage(),
  );
}

/**
 * The channel's programme as a sheet of its own, for a list that has no day column beside it: what is on, the day
 * ahead; OK on the programme on air (or on "Watch") plays the channel.
 */
export function ChannelSchedule(p: { channel: Channel; closing: boolean; onWatch: () => void; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useLayerKeys(root, p.onClose);
  useEffect(() => {
    const box = root.current;
    const now = box?.querySelector<HTMLElement>(".sc-now");
    if (now) now.focus(); else focusFirst(box ?? document, "cs-watch");
  }, []);
  return createPortal(
    <div class={`ch-sched${p.closing ? " out" : ""}`} ref={root}>
      <Drawer variant="panel" title={p.channel.name} label={p.channel.name} onClose={p.onClose} closing={p.closing}>
        <button class="menu-row ch-sched-watch" data-focus="cs-watch" onClick={p.onWatch}>
          <Icon name="play" size={36} /><span class="grow">{t("remindWatch")}</span>
        </button>
        <Schedule channel={p.channel} onWatch={p.onWatch} />
      </Drawer>
    </div>,
    stage(),
  );
}
