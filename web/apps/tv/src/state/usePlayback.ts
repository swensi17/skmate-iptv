import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { defaultEngines, PlayerLadder } from "@skmate/player";

export type PlayState = "loading" | "playing" | "failed";

/** A quick Up/Down zapping must not open a stream per key press: only the channel the finger stops on is opened. */
export const ZAP_SETTLE_MS = 250;
/** Picture frozen for this long: the stream is opened again from the first engine. */
export const STALL_RESTART_MS = 15_000;

/**
 * Plays [channel] on [video]: the engines in turn, a settle delay for zapping, one automatic restart
 * when the picture freezes. Everything about *how* it plays; the screen only shows the state.
 */
export function usePlayback(video: { current: HTMLVideoElement | null }, channel: Channel) {
  const [state, setState] = useState<PlayState>("loading");
  const [engine, setEngine] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const restarts = useRef(0);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    // Why an engine gave up goes to the console: the one line that tells a codec problem from a dead stream.
    const ladder = new PlayerLadder(defaultEngines(), { onFail: (f) => console.warn(`[player] ${f.message}`) });
    let alive = true;
    setState("loading");
    setEngine(null);
    setPaused(false);

    let stall: ReturnType<typeof setTimeout> | undefined;
    const armStall = () => {
      clearTimeout(stall);
      stall = setTimeout(() => {
        if (!alive || restarts.current >= 1) return;
        restarts.current++;
        setAttempt((n) => n + 1);
      }, STALL_RESTART_MS);
    };
    const onWaiting = () => { if (alive) { setState("loading"); armStall(); } };
    const onPlaying = () => { clearTimeout(stall); if (alive) setState("playing"); };
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("playing", onPlaying);

    const source = channel.headers ? { url: channel.url, headers: channel.headers } : { url: channel.url };
    const start = setTimeout(() => {
      armStall();
      ladder.play(el, source).then(
        (e) => { if (alive) { setEngine(e.id); setState("playing"); clearTimeout(stall); } },
        () => { if (alive) { setState("failed"); clearTimeout(stall); } },
      );
    }, ZAP_SETTLE_MS);

    return () => {
      alive = false;
      clearTimeout(start);
      clearTimeout(stall);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("playing", onPlaying);
      ladder.stop();
    };
  }, [channel.url, attempt]);

  // A new channel starts with a fresh allowance of restarts.
  useEffect(() => { restarts.current = 0; }, [channel.url]);

  const retry = useCallback(() => { restarts.current = 0; setAttempt((n) => n + 1); }, []);
  const togglePause = useCallback(() => {
    const el = video.current;
    if (!el) return;
    if (el.paused) { void el.play().catch(() => undefined); setPaused(false); } else { el.pause(); setPaused(true); }
  }, []);

  return { state, engine, paused, retry, togglePause };
}
