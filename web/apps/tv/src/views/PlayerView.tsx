import { useEffect, useRef, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { focusFirst, Icon, isBack, type IconName } from "@skmate/ui";
import { t, type Key } from "../i18n";
import type { Settings } from "../state/settings";
import { usePlayback } from "../state/usePlayback";
import { PlayerSettingRows } from "./SettingsView";


interface Props {
  channels: readonly Channel[];
  index: number;
  favorite: boolean;
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

export function PlayerView({ channels, index, favorite, onStep, onFav, onExit, settings, onChangeSettings }: Props) {
  const channel = channels[index] as Channel;
  const video = useRef<HTMLVideoElement>(null);
  const { state, engine, paused, retry, togglePause } = usePlayback(video, channel, {
    engine: settings.engine, bufferSeconds: settings.buffer, openTimeoutMs: settings.openTimeout * 1000, autoRestart: settings.autoRestart,
  });
  const [panel, setPanel] = useState(false);
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
        if (panel) { setPanel(false); return; }
        if (osd && state !== "failed") { clearTimeout(hideTimer.current); setOsd(false); } else onExit();
        return;
      }
      if (panel) return; // the panel owns the remote while it is open
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
  useEffect(() => { if (panel) focusFirst(document, "s-engine"); }, [panel]);
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

      {panel ? (
        <div class="scrim" data-modal onClick={() => setPanel(false)}>
          <div class="dialog wide" role="dialog" aria-label={t("playerSettingsTitle")} onClick={(e) => e.stopPropagation()}>
            <div class="dialog-title">{t("playerSettingsTitle")}</div>
            <div class="dialog-rows"><PlayerSettingRows settings={settings} onChange={onChangeSettings} /></div>
            <div class="dialog-actions"><button class="btn" data-focus="pl-close" onClick={() => setPanel(false)}>{t("close")}</button></div>
          </div>
        </div>
      ) : null}

      {osd && state !== "failed" && !panel ? (
        <div class="player-bar">
          <Tile id="pl-prev" icon="skip_previous" label="playerPrev" onClick={() => step(-1)} />
          <Tile id="pl-play" icon={paused ? "play" : "pause"} label={paused ? "playerPlay" : "playerPause"} onClick={togglePause} />
          <Tile id="pl-next" icon="skip_next" label="playerNext" onClick={() => step(1)} />
          <Tile id="pl-fav" icon={favorite ? "favorite" : "star"} label="playerFavorite" onClick={() => onFav(channel)} />
          <Tile id="pl-set" icon="settings" label="playerSettings" onClick={() => setPanel(true)} />
          <Tile id="pl-list" icon="list" label="playerList" onClick={onExit} />
        </div>
      ) : null}
    </div>
  );
}
