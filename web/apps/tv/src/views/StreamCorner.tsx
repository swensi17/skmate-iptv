import { useEffect, useRef, useState } from "preact/hooks";
import { FACTS_BEAT_MS, nextFacts, readCounters, standardFps, type EngineFacts, type FactsSample, type StreamFacts } from "@skmate/player";
import { t } from "../i18n";
import { clock } from "../time";

/*
 * The TV-box info's stream pieces (Android TvBoxStreamCorner.kt, 2.5.3 + 2.5.4): the clock and the date at the top
 * right, and "1080p · 50 fps · H.264 · Stereo · 4.7 Mbps" on the right of the line of what follows.
 */

/** "EEE, d MMM" in the app's language, first letter capital: "Чт, 26 нояб.". */
function dateLabel(ms: number): string {
  const lang = (typeof document !== "undefined" && document.documentElement.lang) || undefined;
  let s: string;
  try { s = new Date(ms).toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" }); } catch { s = new Date(ms).toDateString(); }
  return s.charAt(0).toLocaleUpperCase() + s.slice(1);
}

/** The top right of the TV-box info: the clock and the date, redrawn on the minute, not every second. */
export function StreamCorner() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const step = () => { setNow(Date.now()); id = setTimeout(step, 60_000 - (Date.now() % 60_000)); };
    id = setTimeout(step, 60_000 - (Date.now() % 60_000));
    return () => clearTimeout(id);
  }, []);
  return (
    <div class="tb-corner" aria-hidden="true">
      <div class="tb-corner-time">{clock(now)}</div>
      <div class="tb-corner-date">{dateLabel(now)}</div>
    </div>
  );
}

/** The heights TVs name: a picture near one of them is shown as it (1088 is 1080). */
const STANDARD_HEIGHTS = [240, 288, 360, 480, 540, 576, 720, 1080, 1440, 2160, 4320];

/** "FHD 1080p", "UHD 2160p" (2.5.9, TvBoxStreamCorner.resolutionLabel): the height as TVs name it, its class in front. */
export function resolutionLabel(height: number): string {
  const line = STANDARD_HEIGHTS.find((h) => Math.abs(height - h) / h < 0.03) ?? height;
  const grade = line >= 2160 ? "UHD" : line >= 1440 ? "2K" : line >= 1080 ? "FHD" : line >= 720 ? "HD" : "SD";
  return `${grade} ${line}p`;
}

/** The resolution, frames, codec, sound and speed, leaving out what is not known yet (2.5.9 factParts). */
export function factParts(f: StreamFacts): string[] {
  const sound = f.channels == null ? null : f.channels === 1 ? t("plMono") : f.channels === 2 ? t("plStereo") : `${f.channels}.0`;
  const fps = standardFps(f.fps);
  return [
    f.height ? resolutionLabel(f.height) : null,
    fps != null ? t("plFps", { n: fps }) : null,
    f.codec,
    sound ? sound.charAt(0).toLocaleUpperCase() + sound.slice(1) : null,
    f.kbps != null && f.kbps > 0 ? t("plMbps", { v: (f.kbps / 1000).toFixed(1) }) : null,
  ].filter((x): x is string => !!x);
}

/** "50 fps · H.264 · Stereo · 4.7 Mbps", leaving out what is not known yet (factsLine). */
export function factsText(f: StreamFacts): string {
  const sound = f.channels == null ? null : f.channels === 1 ? t("plMono") : f.channels === 2 ? t("plStereo") : `${f.channels}.0`;
  const fps = standardFps(f.fps);
  const parts = [
    fps != null ? t("plFps", { n: fps }) : null,
    f.codec,
    sound ? sound.charAt(0).toLocaleUpperCase() + sound.slice(1) : null,
    f.kbps != null && f.kbps > 0 ? t("plMbps", { v: (f.kbps / 1000).toFixed(1) }) : null,
  ];
  return parts.filter((x): x is string => !!x).join(" · ");
}

/** Each figure of the stream in the same thin white frame (2.5.9), figures of even width so the tags keep their place. */
export function StreamFactsLine({ facts }: { facts: StreamFacts }) {
  return (
    <span class="tb-facts">
      {factParts(facts).map((x) => <span class="tb-tag" key={x}>{x}</span>)}
    </span>
  );
}

/**
 * The stream's facts, sampled once a second from what the browser already counts (frames and bytes decoded) and
 * what the engine says; they reach the screen every two seconds, and only while [on] (the info is up). A new channel
 * ([key]) starts from nothing: the last channel's facts are not this one's.
 */
export function useStreamFacts(video: { current: HTMLVideoElement | null }, engine: () => EngineFacts | null, on: boolean, key: string): StreamFacts | null {
  const [facts, setFacts] = useState<StreamFacts | null>(null);
  const st = useRef<{ facts: StreamFacts | null; last: FactsSample | null; shownAt: number }>({ facts: null, last: null, shownAt: 0 });
  useEffect(() => { st.current = { facts: null, last: null, shownAt: 0 }; setFacts(null); }, [key]);
  useEffect(() => {
    const look = () => {
      const el = video.current;
      if (!el || el.readyState < 2) return;
      const cur = readCounters(el);
      const s = st.current;
      const next = nextFacts(s.facts, s.last, cur, el.videoHeight, engine());
      s.last = cur;
      s.facts = next;
      // Live, but at a steady beat: the figures go on screen every two seconds, the first ones at once.
      if (on && (s.shownAt === 0 || cur.at - s.shownAt >= FACTS_BEAT_MS)) { s.shownAt = cur.at; setFacts(next); }
    };
    look();
    const id = setInterval(look, 1000);
    return () => clearInterval(id);
  }, [on, key]);
  return facts;
}
