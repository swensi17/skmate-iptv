import { useEffect, useRef, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { focusFirst, Icon, isBack, type IconName } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { usePlayback } from "../state/usePlayback";

const OSD_MS = 5000;

interface Props {
  channels: readonly Channel[];
  index: number;
  favorite: boolean;
  /** A step through the list, +1 or -1: applied to the latest position, so a held key never works from a stale one. */
  onStep: (delta: number) => void;
  onFav: (c: Channel) => void;
  onExit: () => void;
}

function Tile(p: { id: string; icon: IconName; label: Key; onClick: () => void }) {
  return (
    <button class="tile" data-focus={p.id} onClick={p.onClick}>
      <span class="tile-icon"><Icon name={p.icon} size={44} /></span>
      <span class="tile-label">{t(p.label)}</span>
    </button>
  );
}

export function PlayerView({ channels, index, favorite, onStep, onFav, onExit }: Props) {
  const channel = channels[index] as Channel;
  const video = useRef<HTMLVideoElement>(null);
  const { state, engine, paused, retry, togglePause } = usePlayback(video, channel);
  const [osd, setOsd] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const wake = () => {
    setOsd(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOsd(false), OSD_MS);
  };
  useEffect(() => { wake(); return () => clearTimeout(hideTimer.current); }, [index]);

  const step = onStep;

  // Capture phase: the player decides first, so Back hides the panel before it leaves the player.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isBack(e)) {
        e.stopPropagation();
        e.preventDefault();
        if (osd && state !== "failed") { clearTimeout(hideTimer.current); setOsd(false); } else onExit();
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
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [osd, state]);

  useEffect(() => { if (osd && state !== "failed") focusFirst(document, "pl-play"); }, [osd && state !== "failed"]);
  useEffect(() => { if (state === "failed") focusFirst(document, "pl-retry"); }, [state]);

  return (
    <div class={`player${osd ? " osd" : ""}`}>
      <video ref={video} class="video" autoplay playsInline />

      <div class="player-top">
        <div class="player-num">{index + 1}</div>
        <div>
          <div class="player-title">{channel.name}</div>
          <div class="player-sub">
            {channel.group}
            {engine ? ` · ${t("playerEngine", { name: engine })}` : ""}
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

      {osd && state !== "failed" ? (
        <div class="player-bar">
          <Tile id="pl-prev" icon="skip_previous" label="playerPrev" onClick={() => step(-1)} />
          <Tile id="pl-play" icon={paused ? "play" : "pause"} label={paused ? "playerPlay" : "playerPause"} onClick={togglePause} />
          <Tile id="pl-next" icon="skip_next" label="playerNext" onClick={() => step(1)} />
          <Tile id="pl-fav" icon={favorite ? "favorite" : "star"} label="playerFavorite" onClick={() => onFav(channel)} />
          <Tile id="pl-list" icon="list" label="playerList" onClick={onExit} />
        </div>
      ) : null}
    </div>
  );
}
