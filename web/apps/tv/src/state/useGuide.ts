import { cacheGet } from "./fetchPlaylist";
import { distinctGuides, parseM3U } from "@skmate/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { resolveArchiveZone, setArchiveZone, type Channel } from "@skmate/core";
import {
  BASE_AHEAD_MS, clearStoredGuide, DAY_MS, GuideCache, GuideData, guidesForPlaylist, GuideWriter, MEMORY_PAST_MS, MemoryKv,
  openGuideKv, readGuideMeta, STORED_PAST_MS, syncGuides, type EpgSource, type GuideKv, type GuideMeta, type SourceOutcome,
} from "@skmate/epg";
import { t } from "../i18n";
import { guideOpener } from "./guideTransport";
import { scoped } from "./scope";
import type { PlaylistEntry } from "./playlists";
import type { Settings } from "./settings";

/**
 * "restoring": the stored guide is being read (a moment); "syncing": a new one downloads, the old one stays shown.
 * [first]: there was no guide before (a new playlist): it fills in as it downloads (2.5.2).
 */
export type GuideStatus = { kind: "idle" } | { kind: "restoring" } | { kind: "syncing"; text: string; first?: boolean };

/** The playlist's guide key, per profile: the localStorage copy, and the name it is kept under in IndexedDB. */
const legacyKey = (playlistId: string) => scoped(`skmate.epg.${playlistId}`);
const MINUTE = 60_000;
/** The first read is only the hour around now (no descriptions), so the screen has the guide at once; the rest follows. */
const FIRST_AHEAD_MS = 3_600_000;
/** Without IndexedDB the guide lives in memory for the session: two days at most, and half a day in localStorage. */
const MEMORY_DAYS = 2;
/** Descriptions of what is on soon are refreshed every quarter of an hour. */
const NEAR_EVERY_MS = 15 * MINUTE;
/** While a first guide arrives, how often what is written so far is shown (Android LiveViewModel GUIDE_PROGRESS_MS). */
const GUIDE_PROGRESS_MS = 8_000;

/** IndexedDB, opened once for the app; the in-memory stand-in where there is none. */
let kvOnce: Promise<GuideKv> | null = null;
function guideKv(): Promise<GuideKv> {
  if (!kvOnce) kvOnce = openGuideKv().then((kv) => kv ?? new MemoryKv(), () => new MemoryKv());
  return kvOnce;
}

/** The guide localStorage kept before IndexedDB (and still keeps where there is none): shown at once while the rest loads. */
function loadLegacy(id: string | null): GuideData {
  if (!id) return new GuideData();
  try { return GuideData.restore(localStorage.getItem(legacyKey(id))); } catch { return new GuideData(); }
}

function mark(name: string): void {
  try { performance.mark(name); } catch { /* an old engine without user timing */ }
}

/**
 * The programme guide of the active playlist, as the Android app keeps it: the stored guide is on screen at once,
 * and a new one downloads in the background when it is older than the chosen interval, from the guides the playlist
 * names, its provider's and the shared ones (plus the user's own), in Android's order.
 *
 * The guide is kept in IndexedDB for the days chosen in Settings (cache.ts); memory holds what is on and the next
 * day, plus the hours the grid asks for. Settings › guide time shift moves every programme, Settings › archive time
 * zone sets the zone archive addresses are written in.
 */
export function useGuide(channels: Channel[], active: PlaylistEntry | null, headerGuides: string[], settings: Settings) {
  const [data, setData] = useState<GuideData>(() => loadLegacy(active?.id ?? null).withShift(settings.epgOffsetMin));
  const [status, setStatus] = useState<GuideStatus>({ kind: "restoring" });
  const [outcomes, setOutcomes] = useState<SourceOutcome[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [restored, setRestored] = useState(false);
  // Looked at again every 10 minutes while open, so "every N hours" also comes while the app stays on.
  const [hourTick, setHourTick] = useState(0);
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) setHourTick((n) => n + 1); }, 10 * 60_000); return () => clearInterval(id); }, []);
  const running = useRef(false);
  const cache = useRef<GuideCache | null>(null);
  const meta = useRef<GuideMeta | null>(null);
  const kvRef = useRef<GuideKv | null>(null);
  const activeId = useRef<string | null>(active?.id ?? null);
  activeId.current = active?.id ?? null;
  const view = useRef<[number, number] | null>(null);
  const nearAt = useRef(0);
  const opts = useRef({ shift: settings.epgOffsetMin, days: settings.guideDays });
  /** How many channels the guide on screen links: none means a first guide is what downloads (2.5.2). */
  const linkedNow = useRef(0);
  linkedNow.current = data.linked;
  opts.current = { shift: settings.epgOffsetMin, days: settings.guideDays };

  const sources = useMemo<EpgSource[]>(() => {
    const own = settings.epgAuto && active
      ? guidesForPlaylist(active.name, active.url, headerGuides).map((g) => ({ id: `auto:${g.url}`, name: g.name, url: g.url }))
      : [];
    return distinctGuides([...own, ...settings.epgSources], (g) => g.url);
  }, [settings.epgAuto, settings.epgSources, active?.id, active?.url, headerGuides.join(",")]);

  // --- Reading the stored guide: what is on and the day after, plus what the grid asked for ---
  const publish = (c: GuideCache) => {
    if (cache.current !== c) return;
    setData(c.snapshot(Date.now(), need.current));
  };
  const reloading = useRef(false);
  const reload = useRef(async (c: GuideCache, first = false): Promise<void> => {
    const at = Date.now();
    const ranges: Array<[number, number]> = [first ? [at - FIRST_AHEAD_MS, at + FIRST_AHEAD_MS] : [at - MEMORY_PAST_MS, at + BASE_AHEAD_MS]];
    if (view.current && !first) ranges.push(view.current);
    let changed = await c.ensure(ranges, at);
    const nearBucket = Math.floor(at / NEAR_EVERY_MS);
    if (!first && (changed || nearAt.current !== nearBucket)) { // descriptions come with the second read
      nearAt.current = nearBucket;
      if (await c.refreshNear(at)) changed = true;
    }
    if (changed || first) publish(c);
  });
  /** The grid scrolled to [from]..[to]: those hours are read in (once per call burst), the ones left behind dropped. */
  const need = useRef((from: number, to: number) => {
    const day = 3_600_000;
    const next: [number, number] = [Math.floor(from / day) * day, Math.ceil(to / day) * day];
    if (view.current && view.current[0] === next[0] && view.current[1] === next[1]) return;
    view.current = next;
    if (reloading.current) return;
    reloading.current = true;
    setTimeout(() => {
      reloading.current = false;
      const c = cache.current;
      if (c) void reload.current(c).catch(() => undefined);
    }, 0);
  });

  /**
   * Makes [m] the guide on screen: the hours ahead first, then the rest of the base window. [light]: a first guide
   * still arriving, shown every few seconds: only the hours around now are read (the grid asks for the rest).
   */
  const adopt = async (kv: GuideKv, pid: string, m: GuideMeta, light = false): Promise<void> => {
    cache.current?.close();
    const c = new GuideCache(kv, legacyKey(pid), m, opts.current.shift, opts.current.days);
    const at = view.current;
    cache.current = c;
    meta.current = m;
    view.current = light ? at : null;
    nearAt.current = 0;
    await reload.current(c, true);
    mark("skmate:guide-cached");
    if (light) { if (at) { view.current = null; need.current(at[0], at[1]); } return; }
    await reload.current(c);
  };

  const mounted = useRef(false);
  useEffect(() => {
    const pid = active?.id ?? null;
    let gone = false;
    cache.current?.close();
    cache.current = null;
    meta.current = null;
    setRestored(false);
    // The first playlist's legacy copy was read by useState already.
    if (mounted.current) setData(loadLegacy(pid).withShift(opts.current.shift));
    mounted.current = true;
    if (!pid) { setStatus({ kind: "idle" }); return; }
    setStatus({ kind: "restoring" });
    mark("skmate:guide-restore");
    void (async () => {
      try {
        const kv = await guideKv();
        kvRef.current = kv;
        if (gone) return;
        const read = kv.persistent ? await readGuideMeta(kv, legacyKey(pid)) : null;
        if (gone) return;
        // A guide linked before 2.7.0 keeps its channels by their place in the list ("0", "1", …): turned into the
        // lasting ids through the copy of the very list it was linked for, so it shows at once, not after a download.
        const m = read ? relinkLegacy(read, () => { const text = cacheGet(pid); return text ? parseM3U(text) : null; }) : null;
        if (m) {
          await adopt(kv, pid, m);
          // The guide is in IndexedDB now: the old localStorage copy only costs a parse at every start.
          try { localStorage.removeItem(legacyKey(pid)); } catch { /* nothing stored */ }
        }
      } catch {
        // an unreadable store is an empty one: the guide downloads again
      } finally {
        if (!gone) { setRestored(true); setStatus((s) => (s.kind === "restoring" ? { kind: "idle" } : s)); }
      }
    })();
    return () => { gone = true; };
  }, [active?.id]);

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      const c = cache.current;
      if (c) void reload.current(c).catch(() => undefined);
    }, MINUTE);
    return () => clearInterval(id);
  }, []);

  // Settings › guide time shift: every programme moves; the stored guide is not rewritten (Android EpgShift).
  useEffect(() => {
    const c = cache.current;
    if (c) {
      void c.setShift(settings.epgOffsetMin).then((moved) => { if (moved) { nearAt.current = 0; return reload.current(c).then(() => publish(c)); } }).catch(() => undefined);
    } else {
      setData((d) => d.withShift(settings.epgOffsetMin));
    }
  }, [settings.epgOffsetMin]);

  // Settings › days of guide kept: fewer shows (and holds) less at once; more is downloaded (the effect below).
  useEffect(() => {
    const c = cache.current;
    if (!c) return;
    c.setDays(settings.guideDays);
    void reload.current(c).then(() => publish(c)).catch(() => undefined);
  }, [settings.guideDays]);

  // Settings › archive time zone (and the playlist's own): the zone archive addresses are written in.
  const own = active ? settings.catchupPerPlaylist[active.id] : undefined;
  useEffect(() => {
    setArchiveZone(resolveArchiveZone(settings.catchupTz, settings.catchupOffsetMin, own));
  }, [settings.catchupTz, settings.catchupOffsetMin, own]);

  const sync = useCallback(async () => {
    if (running.current || !active || channels.length === 0 || sources.length === 0) return;
    running.current = true;
    syncedThisRun = true;
    const pid = active.id;
    // Nothing stored yet (a new playlist): the guide fills in on screen as it downloads (2.5.2).
    const first = meta.current === null && cache.current === null && linkedNow.current === 0;
    setStatus({ kind: "syncing", text: t("guideLoading"), first });
    let writer: GuideWriter | null = null;
    let progress: ReturnType<typeof setInterval> | undefined;
    let inflight: Promise<void> = Promise.resolve();
    try {
      const kv = kvRef.current ?? (await guideKv());
      kvRef.current = kv;
      const days = kv.persistent ? settings.guideDays : Math.min(settings.guideDays, MEMORY_DAYS);
      const at = Date.now();
      writer = new GuideWriter(kv, legacyKey(pid), at);
      writer.past = kv.persistent ? archiveDepthMs(channels) : STORED_PAST_MS;
      writer.chans = channelsPrint(channels);
      const result = await syncGuides({
        sources, channels, now: at, open: guideOpener(settings.proxy),
        aheadMs: days * DAY_MS, pastMs: writer.past, sink: writer,
        pastFor: (c) => Math.min(7, c.catchupDays ?? 0) * DAY_MS + 3_600_000, shortPastMs: STORED_PAST_MS,
        // Nothing to show yet (a first start): the first source's channels appear while the others still download.
        onSource: async (sofar) => {
          const w = writer;
          if (!w || meta.current !== null || activeId.current !== pid) return;
          await w.flush();
          await adopt(kv, pid, w.draft(sofar.links, sofar.logos, at, days));
          meta.current = null; // a draft: the stored guide is still missing until the commit
        },
        onProgress: (source, stage) => {
          if (stage !== "done") setStatus({ kind: "syncing", first, text: t(stage === "download" ? "guideStageDownload" : "guideStageMatch", { source: source.name }) });
        },
        // A first guide: its rows at once (a quiet bar each), then every few seconds what has been written so far,
        // so channels fill in as their programmes arrive instead of all at the end (LiveViewModel 2.5.2).
        onLinked: async (sofar) => {
          if (!first || progress !== undefined) return;
          let busy = false;
          const show = async () => {
            const w = writer;
            if (busy || !w || meta.current !== null || activeId.current !== pid) return;
            busy = true;
            try {
              await w.flush();
              await adopt(kv, pid, w.draft(sofar.links, sofar.logos, at, days), true);
              meta.current = null; // a draft: the stored guide is still missing until the commit
            } catch { /* the next look, or the commit, shows it */ } finally { busy = false; }
          };
          progress = setInterval(() => { inflight = show(); }, GUIDE_PROGRESS_MS);
          inflight = show();
          await inflight;
        },
      });
      clearInterval(progress);
      progress = undefined;
      await inflight; // a look still reading must not undo the commit below
      setOutcomes(result.outcomes);
      // A refresh that found nothing must not wipe a guide that worked: the old one stays then.
      if (result.data.linked === 0) { await writer.abort(); return; }
      const m = await writer.commit(result.data.links, result.data.logos, at, days);
      writer = null;
      if (activeId.current !== pid) return;
      await adopt(kv, pid, m);
      if (kv.persistent) {
        try { localStorage.removeItem(legacyKey(pid)); } catch { /* nothing stored */ }
      } else {
        // No IndexedDB: half a day goes to localStorage for the next start, once the new rows have been drawn.
        setTimeout(() => {
          const c = cache.current;
          if (!c || activeId.current !== pid) return;
          try { localStorage.setItem(legacyKey(pid), c.snapshot(Date.now()).serialize(Date.now())); } catch { /* storage full */ }
        }, 1500);
      }
    } catch {
      if (writer) await writer.abort().catch(() => undefined);
    } finally {
      clearInterval(progress);
      running.current = false;
      setStatus({ kind: "idle" });
    }
  }, [active?.id, channels, sources, settings.proxy, settings.guideDays]);

  // Refresh once the stored guide is read and the channels are in, when it is missing, older than the interval, or
  // holds fewer days than are now asked for.
  useEffect(() => {
    if (!restored || !active || channels.length === 0 || sources.length === 0) return;
    const m = meta.current;
    const persistent = kvRef.current?.persistent ?? false;
    const stale = data.linked === 0 || (persistent && m === null)
      // Settings › guide update (2.6.9): never by itself (0), once at each start (-1), or every N hours.
      || (settings.epgEvery > 0 && Date.now() - data.updatedAt > settings.epgEvery * 3_600_000)
      || (settings.epgEvery === -1 && !syncedThisRun)
      || (m !== null && m.days < settings.guideDays && persistent)
      // A guide kept from before 2.6.3 (or for a playlist with a shallower archive) lacks the archive's days.
      || (m !== null && persistent && (m.past ?? STORED_PAST_MS) < archiveDepthMs(channels))
      // Channels added, removed or renamed since the guide was linked: linked again for this playlist (2.6.9). A guide
      // linked before channels had lasting ids (by place in the list) is linked again too.
      // Channels added or removed since: linked again, but never more often than RELINK_GAP (an Xtream list may differ a
      // little at every start) and never for a guide that did not keep which channels it was linked for.
      || (m !== null && persistent && m.chans !== undefined && m.chans !== channelsPrint(channels) && Date.now() - data.updatedAt > RELINK_GAP);
    if (stale) void sync();
  }, [restored, active?.id, channels, sources.length, settings.guideDays, settings.epgEvery, hourTick]);

  const clear = useCallback(() => {
    if (active) {
      try { localStorage.removeItem(legacyKey(active.id)); } catch { /* nothing stored */ }
      const kv = kvRef.current;
      if (kv) void clearStoredGuide(kv, legacyKey(active.id)).catch(() => undefined);
    }
    cache.current?.close();
    cache.current = null;
    meta.current = null;
    setData(new GuideData());
    setOutcomes([]);
  }, [active?.id]);

  return { data, status, outcomes, now, sync, clear };
}

/**
 * How far back the stored guide reaches: the deepest archive of the playlist's channels (at most a week), so its
 * programme shows the aired days the archive can play (2.6.3); 6 hours for a playlist without an archive.
 */
export function archiveDepthMs(channels: readonly { catchupDays?: number }[]): number {
  let days = 0;
  for (const c of channels) if ((c.catchupDays ?? 0) > days) days = c.catchupDays as number;
  return days > 0 ? Math.min(7, days) * 86_400_000 + 3_600_000 : STORED_PAST_MS;
}

/** A short fingerprint of which channels a playlist has (their lasting ids), whatever their order. */
export function channelsPrint(channels: readonly { id: string }[]): string {
  const ids = channels.map((c) => c.id).sort();
  let h = 0x811c9dc5;
  for (const id of ids) for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${ids.length}:${h.toString(36)}`;
}

/** A changed channel set links the guide again at most this often (it downloads every source). */
const RELINK_GAP = 3 * 3_600_000;

/** Whether the guide was downloaded since the app started (Settings › guide update › at start). */
let syncedThisRun = false;

/** See the restore: links by place in the list moved to the lasting ids of the same entries. */
export function relinkLegacy(m: GuideMeta, entries: () => ReadonlyArray<{ id: string }> | null): GuideMeta {
  if (!m.links.some(([id]) => /^\d+$/.test(id))) return m;
  const list = entries();
  if (!list) return m;
  return { ...m, links: m.links.map(([id, epg]): [string, string] => [/^\d+$/.test(id) ? list[Number(id)]?.id ?? id : id, epg]) };
}
