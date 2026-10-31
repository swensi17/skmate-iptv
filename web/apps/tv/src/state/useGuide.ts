import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { GuideData, guidesForPlaylist, syncGuides, type EpgSource, type SourceOutcome } from "@skmate/epg";
import { t } from "../i18n";
import { guideOpener } from "./guideTransport";
import { scoped } from "./scope";
import type { PlaylistEntry } from "./playlists";
import type { Settings } from "./settings";

export type GuideStatus = { kind: "idle" } | { kind: "syncing"; text: string };

const cacheKey = (playlistId: string) => scoped(`skmate.epg.${playlistId}`);
const MINUTE = 60_000;

function loadCache(id: string | null): GuideData {
  if (!id) return new GuideData();
  try { return GuideData.restore(localStorage.getItem(cacheKey(id))); } catch { return new GuideData(); }
}

function saveCache(id: string, data: GuideData): void {
  try { localStorage.setItem(cacheKey(id), data.serialize(Date.now())); } catch { /* storage full: the guide is fetched again next time */ }
}

/**
 * The programme guide of the active playlist: shown from the cache at once, refreshed in the background when
 * it is older than the chosen interval, from the guides the playlist names, its provider's and the shared ones
 * (plus the user's own), exactly as the Android app orders them.
 */
export function useGuide(channels: Channel[], active: PlaylistEntry | null, headerGuides: string[], settings: Settings) {
  const [data, setData] = useState<GuideData>(() => loadCache(active?.id ?? null));
  const [status, setStatus] = useState<GuideStatus>({ kind: "idle" });
  const [outcomes, setOutcomes] = useState<SourceOutcome[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const running = useRef(false);

  const sources = useMemo<EpgSource[]>(() => {
    const own = settings.epgAuto && active
      ? guidesForPlaylist(active.name, active.url, headerGuides).map((g) => ({ id: `auto:${g.url}`, name: g.name, url: g.url }))
      : [];
    return [...own, ...settings.epgSources];
  }, [settings.epgAuto, settings.epgSources, active?.id, active?.url, headerGuides.join(",")]);

  useEffect(() => { setData(loadCache(active?.id ?? null)); }, [active?.id]);
  useEffect(() => {
    const id = setInterval(() => { setNow(Date.now()); }, MINUTE);
    return () => clearInterval(id);
  }, []);

  const sync = useCallback(async () => {
    if (running.current || !active || channels.length === 0 || sources.length === 0) return;
    running.current = true;
    setStatus({ kind: "syncing", text: t("guideLoading") });
    try {
      const result = await syncGuides({
        sources, channels, now: Date.now(), open: guideOpener(settings.proxy),
        onProgress: (source, stage) => {
          if (stage !== "done") setStatus({ kind: "syncing", text: t(stage === "download" ? "guideStageDownload" : "guideStageMatch", { source: source.name }) });
        },
      });
      setOutcomes(result.outcomes);
      // A refresh that found nothing must not wipe a guide that worked: keep the old one then.
      if (result.data.linked > 0) { setData(result.data); saveCache(active.id, result.data); }
    } finally {
      running.current = false;
      setStatus({ kind: "idle" });
    }
  }, [active?.id, channels, sources, settings.proxy]);

  // Refresh when the channels arrive and the guide is missing or older than the interval.
  useEffect(() => {
    if (!active || channels.length === 0 || sources.length === 0) return;
    const stale = data.linked === 0 || Date.now() - data.updatedAt > settings.epgEvery * 3_600_000;
    if (stale) void sync();
  }, [active?.id, channels.length, sources.length]);

  const clear = useCallback(() => {
    if (active) { try { localStorage.removeItem(cacheKey(active.id)); } catch { /* nothing stored */ } }
    setData(new GuideData());
    setOutcomes([]);
  }, [active?.id]);

  return { data, status, outcomes, now, sync, clear };
}
