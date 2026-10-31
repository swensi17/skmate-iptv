import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { pickMirrors, type Channel } from "@skmate/core";
import { focusFirst, Icon, isBack, Presence, type IconName } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { channelKey } from "../state/favorites";
import { GuideContext } from "../state/GuideContext";
import type { Settings } from "../state/settings";
import { usePlayback } from "../state/usePlayback";
import { clock } from "../time";
import { leftLabel } from "./Left";
import { ChannelLogo } from "./ChannelLogo";
import { PlayerPanel, type Go, type PanelTab } from "./PlayerPanel";

interface Props {
  channels: readonly Channel[];
  /** The whole playlist: copies of a channel are looked up here, not only in the list being browsed. */
  catalog: readonly Channel[];
  index: number;
  favorites: ReadonlySet<string>;
  /** Recently watched channels, the latest first. */
  recents: readonly Channel[];
  /** A channel picked in a side list: it plays, and [list] is what the channel keys step through. */
  onPick: (c: Channel, list: readonly Channel[]) => void;
  /** The player is leaving: it fades out. */
  closing: boolean;
  /** A step through the list, +1 or -1: applied to the latest position, so a held key never works from a stale one. */
  onStep: (delta: number) => void;
  onFav: (c: Channel) => void;
  onExit: () => void;
  settings: Settings;
  onChangeSettings: (s: Settings) => void;
  /** Leave the player for another place of the app (the main menu's Home, Guide, Sport, Search). */
  onGo: (to: Go) => void;
}

function Tile(p: { id: string; icon: IconName; label: Key; onClick: () => void }) {
  return (
    <button class="tile" data-focus={p.id} onClick={p.onClick}>
      <span class="tile-icon"><Icon name={p.icon} size={44} /></span>
      <span class="tile-label">{t(p.label)}</span>
    </button>
  );
}

const CH_UP = [427, 33];
const CH_DOWN = [428, 34];

/**
 * Full-screen playback. Keys: OK pauses and resumes; Up or Down first show the action bar, then step through the
 * channels; Right opens the recently watched, Left the channels (each from its own edge); the channel keys always step; Back closes what is open, then leaves.
 */
export function PlayerView({ channels, catalog, index, favorites, recents, onPick, closing, onStep, onFav, onExit, settings, onChangeSettings, onGo }: Props) {
  const channel = channels[index] as Channel;
  const video = useRef<HTMLVideoElement>(null);
  const mirrors = useMemo(() => pickMirrors(channel, catalog), [channel.id, catalog]);
  const { state, engine, paused, retry, togglePause, via } = usePlayback(video, channel, {
    engine: settings.engine, bufferSeconds: settings.buffer, openTimeoutMs: settings.openTimeout * 1000, autoRestart: settings.autoRestart,
  }, mirrors);
  const guide = useContext(GuideContext);
  const { now: onNow, next, progress } = guide.data.nowNext(channel.id, guide.now);
  const favorite = favorites.has(channelKey(channel));

  // Two layers: the info strip (what is on) and the action bar (what can be done). The panel is the side menu.
  const [info, setInfo] = useState(true);
  const [bar, setBar] = useState(false);
  // A list that opens inside the bar itself, in place of its buttons.
  const [strip, setStrip] = useState<null | "favorites" | "recent">(null);
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState<PanelTab>("channels");
  const [side, setSide] = useState<"left" | "right">("right");
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const wake = (withBar = false) => {
    if (panel) return; // an open menu keeps the strip and the bar
    setInfo(true);
    if (withBar) setBar(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { setInfo(false); setBar(false); setStrip(null); }, settings.osdSeconds * 1000);
  };
  // The strip shows on every new channel, then goes by itself; a paused picture keeps it.
  useEffect(() => { setBar(false); setStrip(null); wake(); return () => clearTimeout(hideTimer.current); }, [channel.id]);
  useEffect(() => { if (paused) { clearTimeout(hideTimer.current); setInfo(true); } else wake(); }, [paused]);

  // An open panel keeps the info strip on screen and it does not go away by itself.
  const openPanel = (to: PanelTab, from: "left" | "right" = "right") => { setTab(to); setSide(from); setPanel(true); setInfo(true); setBar(false); clearTimeout(hideTimer.current); };
  const stripList = strip === "favorites" ? catalog.filter((c) => favorites.has(channelKey(c))) : strip === "recent" ? recents : [];
  const openStrip = (to: "favorites" | "recent") => { setStrip(to); clearTimeout(hideTimer.current); setTimeout(() => focusFirst(document, "ps-first"), 30); };
  // OK arms the bar: the Down that follows it opens the bar instead of stepping to the next channel.
  const ok = useRef(false);

  // Capture phase: the player decides first, so Back closes the menu before it leaves the player.
  useEffect(() => {
    const swallow = (e: KeyboardEvent) => { e.stopPropagation(); e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      if (isBack(e)) {
        swallow(e);
        if (panel) setPanel(false);
        else if (strip) { const was = strip; setStrip(null); setTimeout(() => focusFirst(document, was === "favorites" ? "pl-favs" : "pl-recent"), 30); }
        else if (bar) setBar(false);
        else if (info && state !== "failed" && !paused) { clearTimeout(hideTimer.current); setInfo(false); }
        else onExit();
        return;
      }
      if (state === "failed") return; // the error screen has its own buttons
      const up = e.key === "ArrowUp";
      const down = e.key === "ArrowDown";
      if (CH_UP.includes(e.keyCode)) { swallow(e); onStep(1); return; }
      if (CH_DOWN.includes(e.keyCode)) { swallow(e); onStep(-1); return; }
      const left = e.key === "ArrowLeft";
      const right = e.key === "ArrowRight";
      if (panel) {
        // Left walks deeper into the menu (channels, categories, home), Right walks back and then closes it.
        const edge = side === "left" ? left : right; // the key that leads away from the picture
        const back = side === "left" ? right : left;
        if (tab === "channels" && side === "left") {
          if (edge) { swallow(e); setTab("groups"); return; }
          if (back) { swallow(e); setPanel(false); return; }
        } else if (tab === "groups") {
          if (edge) { swallow(e); setTab("menu"); return; }
          if (back) { swallow(e); setTab("channels"); return; }
        } else if (tab === "menu") {
          if (back) { swallow(e); setTab("groups"); return; }
          if (edge) { swallow(e); return; }
        } else if ((tab === "recent" || tab === "favorites") && back) { swallow(e); if (side === "left") setTab("menu"); else setPanel(false); return; }
        return; // the panel's own lists take the rest
      }
      if (up || down) {
        swallow(e);
        if (bar) { if (up) { setBar(false); wake(); } return; } // on the bar Up leaves it
        if (down && (ok.current || paused)) { ok.current = false; wake(true); setTimeout(() => focusFirst(document, "pl-play"), 30); return; }
        onStep(up ? 1 : -1); // straight up and down steps through the channels
        wake();
        return;
      }
      if (left || right) {
        // On the bar the arrows walk its buttons; on the picture Left brings the channels, Right what was watched lately.
        if (!bar) { swallow(e); openPanel(left ? "channels" : "recent", left ? "left" : "right"); return; }
        wake(true);
        return;
      }
      if (e.key === "Enter" || e.keyCode === 13 || e.keyCode === 415 || e.keyCode === 19) {
        // OK on the picture pauses it; on a button of the bar it presses that button.
        if (!bar) { swallow(e); ok.current = true; setTimeout(() => { ok.current = false; }, settings.osdSeconds * 1000); togglePause(); wake(); }
        else wake(true);
        return;
      }
      swallow(e);
      wake();
    };
    const onMove = (e: MouseEvent) => { if (e.movementX !== 0 || e.movementY !== 0) wake(); };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousemove", onMove, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousemove", onMove, true);
    };
  }, [info, bar, strip, panel, tab, side, state, paused, channel.id]);

  useEffect(() => { if (state === "failed") focusFirst(document, "pl-retry"); }, [state]);

  const looks = settings.aspect === "fit" ? "contain" : settings.aspect === "fill" ? "fill" : "cover";
  return (
    <div class={`player${info ? " info" : ""}${bar ? " with-bar" : ""}${closing ? " closing" : ""}`}>
      <video ref={video} class="video" style={{ objectFit: looks }} autoplay playsInline />
      <div class="player-shade" />

      <div class={`spinner${state === "loading" ? " on" : ""}`} aria-label={t("playerLoading")} />
      {paused ? <div class="paused" aria-label={t("playerPaused")}><Icon name="pause" size={96} /></div> : null}

      {/* What is on, as in the phone version: the logo, the programme, its time and what is left, the channel, what is next. */}
      <div class="pinfo">
        <div class="pinfo-logo"><ChannelLogo channel={channel} /></div>
        <div class="pinfo-text">
          <div class="pinfo-title">{onNow ? onNow.title : channel.name}</div>
          <div class="pinfo-line">
            {onNow ? <span>{clock(onNow.start)} – {clock(onNow.stop)}</span> : null}
            {onNow ? <span class="pinfo-bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></span> : null}
            {onNow ? <span>{leftLabel(onNow.stop, guide.now)}</span> : null}
            <b>{index + 1}</b><b>{channel.name}</b>
          </div>
          {next ? <div class="pinfo-next">{clock(next.start)} – {clock(next.stop)}  {next.title}</div> : null}
          {via ? <div class="pinfo-next">{t("playerMirror", { name: via.name })}</div> : null}
          {engine && settings.showEngine ? <div class="pinfo-next">{t("playerEngine", { name: engine })}</div> : null}
        </div>
      </div>
      <div class="pline"><span style={{ width: `${Math.round(progress * 100)}%` }} /><i style={{ left: `${Math.round(progress * 100)}%` }} /></div>

      {state === "failed" ? (
        <div class="player-error" data-modal>
          <Icon name="warning" size={96} />
          <div class="player-error-title">{t("playerFailed")}</div>
          <div class="player-note">{t("playerFailedHint")}</div>
          <div class="empty-actions">
            <button class="btn" data-focus="pl-retry" onClick={retry}>{t("playerRetry")}</button>
            <button class="btn" data-focus="pl-back" onClick={onExit}>{t("playerBack")}</button>
          </div>
        </div>
      ) : null}

      <Presence show={panel}>
        {(out) => (
          <PlayerPanel
            side={side} tab={tab} onTab={setTab} closing={out} onClose={() => setPanel(false)}
            channels={channels} catalog={catalog} index={index} recents={recents} favorites={favorites}
            onPick={(c, list) => { onPick(c, list); setPanel(false); }} onFav={onFav}
            settings={settings} onChangeSettings={onChangeSettings} onGo={onGo}
          />
        )}
      </Presence>

      {bar && state !== "failed" ? (
        strip ? (
          <div class="player-bar player-strip" role="list" aria-label={t(strip === "favorites" ? "favorites" : "panelRecent")}>
            {stripList.length === 0 ? <div class="strip-empty">{t(strip === "favorites" ? "favoritesEmpty" : "recentEmpty")}</div> : stripList.map((c, i) => (
              <button class="strip-card" key={c.id} data-focus={i === 0 ? "ps-first" : `ps-${c.id}`} onClick={() => { onPick(c, stripList); setStrip(null); setBar(false); }}>
                <span class="strip-logo"><ChannelLogo channel={c} /></span>
                <span class="strip-name">{c.name}</span>
              </button>
            ))}
          </div>
        ) : (
        <div class="player-bar">
          <Tile id="pl-prev" icon="skip_previous" label="playerPrev" onClick={() => onStep(-1)} />
          <Tile id="pl-play" icon={paused ? "play" : "pause"} label={paused ? "playerPlay" : "playerPause"} onClick={togglePause} />
          <Tile id="pl-next" icon="skip_next" label="playerNext" onClick={() => onStep(1)} />
          <Tile id="pl-fav" icon={favorite ? "favorite" : "star"} label="playerFavorite" onClick={() => onFav(channel)} />
          <Tile id="pl-favs" icon="list" label="favorites" onClick={() => openStrip("favorites")} />
          <Tile id="pl-recent" icon="history" label="panelRecent" onClick={() => openStrip("recent")} />
          <Tile id="pl-set" icon="settings" label="playerSettings" onClick={() => openPanel("settings", "right")} />
          <Tile id="pl-list" icon="home" label="playerMenu" onClick={() => openPanel("channels", "left")} />
        </div>
        )
      ) : null}
    </div>
  );
}
