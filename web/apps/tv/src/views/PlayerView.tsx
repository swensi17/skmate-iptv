import { useEffect, useRef, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { Drawer, focusFirst, Icon, isBack, VirtualList, type IconName } from "@skmate/ui";
import { t, type Key } from "../i18n";
import type { Settings } from "../state/settings";
import { usePlayback } from "../state/usePlayback";
import { channelKey } from "../state/favorites";
import { ChannelRow } from "./ChannelRow";
import { PlayerSettingRows } from "./PlayerRows";


interface Props {
  channels: readonly Channel[];
  index: number;
  favorites: ReadonlySet<string>;
  onJump: (index: number) => void;
  /** A step through the list, +1 or -1: applied to the latest position, so a held key never works from a stale one. */
  onStep: (delta: number) => void;
  onFav: (c: Channel) => void;
  onExit: () => void;
  settings: Settings;
  onChangeSettings: (s: Settings) => void;
}

function Tile(p: { id: string; icon: IconName; label: Key; onClick: () => void }) {
  return (
    <button class="tile" data-focus={p.id} onClick={p.onClick}>
      <span class="tile-icon"><Icon name={p.icon} size={44} /></span>
      <span class="tile-label">{t(p.label)}</span>
    </button>
  );
}

export function PlayerView({ channels, index, favorites, onJump, onStep, onFav, onExit, settings, onChangeSettings }: Props) {
  const channel = channels[index] as Channel;
  const video = useRef<HTMLVideoElement>(null);
  const { state, engine, paused, retry, togglePause } = usePlayback(video, channel, {
    engine: settings.engine, bufferSeconds: settings.buffer, openTimeoutMs: settings.openTimeout * 1000, autoRestart: settings.autoRestart,
  });
  // Left opens the settings, Right the channel list: sheets from the edges, as on the phone.
  const [drawer, setDrawer] = useState<"settings" | "channels" | null>(null);
  const panel = drawer !== null;
  const favorite = favorites.has(channelKey(channel));
  const [osd, setOsd] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const wake = () => {
    setOsd(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOsd(false), settings.osdSeconds * 1000);
  };
  useEffect(() => { wake(); return () => clearTimeout(hideTimer.current); }, [index]);

  const step = onStep;

  // Capture phase: the player decides first, so Back hides the panel before it leaves the player.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isBack(e)) {
        e.stopPropagation();
        e.preventDefault();
        if (panel) { setDrawer(null); return; }
        if (osd && state !== "failed") { clearTimeout(hideTimer.current); setOsd(false); } else onExit();
        return;
      }
      if (panel) return; // the sheet owns the remote while it is open
      if (!osd && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.stopPropagation();
        e.preventDefault();
        setDrawer(e.key === "ArrowLeft" ? "settings" : "channels");
        return;
      }
      if (e.key === "ArrowUp" || e.keyCode === 427) { e.stopPropagation(); e.preventDefault(); step(1); return; }
      if (e.key === "ArrowDown" || e.keyCode === 428) { e.stopPropagation(); e.preventDefault(); step(-1); return; }
      if (!osd) {
        // Any other key only wakes the panel; it does not also act on what is under it.
        e.stopPropagation();
        e.preventDefault();
        wake();
        return;
      }
      wake();
    };
    const onMove = (e: MouseEvent) => { if (e.movementX !== 0 || e.movementY !== 0) wake(); };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousemove", onMove, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousemove", onMove, true);
    };
  }, [osd, state, panel]);

  useEffect(() => { if (osd && state !== "failed" && !panel) focusFirst(document, "pl-play"); }, [osd && state !== "failed" && !panel]);
  useEffect(() => { if (drawer === "settings") focusFirst(document, "s-engine"); }, [drawer]);
  useEffect(() => { if (state === "failed") focusFirst(document, "pl-retry"); }, [state]);

  return (
    <div class={`player${osd ? " osd" : ""}`}>
      <video ref={video} class="video" style={{ objectFit: settings.aspect === "fit" ? "contain" : settings.aspect === "fill" ? "fill" : "cover" }} autoplay playsInline />

      <div class="player-top">
        <div class="player-num">{index + 1}</div>
        <div>
          <div class="player-title">{channel.name}</div>
          <div class="player-sub">
            {channel.group}
            {engine && settings.showEngine ? ` · ${t("playerEngine", { name: engine })}` : ""}
          </div>
        </div>
      </div>

      {state === "loading" ? <div class="spinner" aria-label={t("playerLoading")} /> : null}

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

      {drawer === "settings" ? (
        <Drawer side="left" width={980} label={t("playerSettingsTitle")} onClose={() => setDrawer(null)}>
          <div class="drawer-title">{t("playerSettingsTitle")}</div>
          <div class="drawer-body"><PlayerSettingRows settings={settings} onChange={onChangeSettings} /></div>
        </Drawer>
      ) : null}

      {drawer === "channels" ? (
        <Drawer side="right" width={860} label={t("drawerChannels")} onClose={() => setDrawer(null)}>
          <div class="drawer-title">{t("drawerChannels")}</div>
          <VirtualList
            items={channels} rowHeight={84} height={900} pageSize={10} initialIndex={index} autofocus
            idOf={(c) => `dc-${c.id}`}
            renderRow={(c, i) => (
              <ChannelRow channel={c} index={i} favorite={favorites.has(channelKey(c))}
                onOpen={() => { onJump(i); setDrawer(null); }} onFav={onFav} />
            )}
          />
        </Drawer>
      ) : null}

      {osd && state !== "failed" && !panel ? (
        <div class="player-bar">
          <Tile id="pl-prev" icon="skip_previous" label="playerPrev" onClick={() => step(-1)} />
          <Tile id="pl-play" icon={paused ? "play" : "pause"} label={paused ? "playerPlay" : "playerPause"} onClick={togglePause} />
          <Tile id="pl-next" icon="skip_next" label="playerNext" onClick={() => step(1)} />
          <Tile id="pl-fav" icon={favorite ? "favorite" : "star"} label="playerFavorite" onClick={() => onFav(channel)} />
          <Tile id="pl-set" icon="settings" label="playerSettings" onClick={() => setDrawer("settings")} />
          <Tile id="pl-list" icon="list" label="playerList" onClick={() => setDrawer("channels")} />
        </div>
      ) : null}
    </div>
  );
}
