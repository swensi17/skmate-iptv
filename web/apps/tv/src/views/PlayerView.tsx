import { useEffect, useRef, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { defaultEngines, PlayerLadder } from "@skmate/player";
import { t } from "../i18n";

type State = "loading" | "playing" | "failed";

export function PlayerView({ channel }: { channel: Channel }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const ladder = new PlayerLadder(defaultEngines());
    setState("loading");
    const source = channel.headers ? { url: channel.url, headers: channel.headers } : { url: channel.url };
    ladder.play(el, source).then(() => setState("playing"), () => setState("failed"));
    return () => ladder.stop();
  }, [channel]);

  return (
    <div class="player">
      <video ref={video} class="video" autoplay playsInline />
      <div class="player-top">
        <div class="player-title">{channel.name}</div>
        {state === "loading" ? <div class="player-note">{t("playerLoading")}</div> : null}
      </div>
      {state === "failed" ? (
        <div class="player-error">
          <div class="player-error-title">{t("playerFailed")}</div>
          <div class="player-note">{t("playerFailedHint")}</div>
        </div>
      ) : null}
    </div>
  );
}
