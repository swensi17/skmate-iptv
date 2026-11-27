import type { Channel } from "@skmate/core";
import { AUTO_THRESHOLD, GuideIndex } from "./match";
import { GuideData, KEEP_AHEAD_MS, KEEP_PAST_MS } from "./store";
import { readGuide } from "./stream";
import { XmltvScanner, type GuideChannel, type Programme } from "./xmltv";
import { breathe } from "./yielder";

export interface EpgSource { id: string; name: string; url: string }

export interface SourceOutcome {
  source: EpgSource;
  ok: boolean;
  error?: string;
  guideChannels: number;
  linked: number;
  programmes: number;
}

export type Stage = "download" | "match" | "done";

export interface SyncOptions {
  sources: readonly EpgSource[];
  channels: readonly Channel[];
  now: number;
  /** Opens a guide address: a plain request, or one through the proxy when the TV may not reach it directly. */
  open: (url: string) => Promise<Response>;
  onProgress?: (source: EpgSource, stage: Stage) => void;
  isCancelled?: () => boolean;
  /** How far ahead of [now] programmes are kept (Settings › days of guide kept); 12 h by default. */
  aheadMs?: number;
  /** How far back a programme that is over is still kept; 1 h by default. */
  pastMs?: number;
  /**
   * Where the programmes go as they are read (the IndexedDB writer, see cache.ts). Without it they are collected in
   * the returned GuideData, which is fine for half a day but not for a week of a large playlist.
   */
  sink?: GuideSink;
  /** After each source that linked channels: what is linked so far (a first guide can be shown before the rest). */
  onSource?: (data: GuideData) => void | Promise<void>;
  /**
   * As soon as a source's channels are linked, before its programmes are read: the links so far (the same object,
   * filled further as later sources link more). A first guide shows its rows from here, filling in as it downloads.
   */
  onLinked?: (data: GuideData) => void | Promise<void>;
}

/** Takes programmes while a guide is read, and writes them away whenever [full] says enough has gathered. */
export interface GuideSink {
  add(epgId: string, p: Programme): void;
  readonly full: boolean;
  flush(): Promise<void>;
}

const MATCH_CHUNK = 120;

/** A name as it is, only case, spaces and ё set aside: "ТНТ4 HD" stays apart from "ТНТ4" (2.6.4). */
export const exactName = (s: string): string => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const FEED_SLICE = 48 * 1024;

/**
 * Fills the guide for [channels] from [sources] in order, as the Android app does: a source links the channels
 * the earlier ones left (by guide id first, then by name), and only the programmes of channels it linked are
 * kept. Sources are not all read once the channels are all linked. Never throws: a failing source is reported.
 */
export async function syncGuides(o: SyncOptions): Promise<{ data: GuideData; outcomes: SourceOutcome[] }> {
  const data = new GuideData(new Map(), new Map(), o.now);
  const from = o.now - (o.pastMs ?? KEEP_PAST_MS);
  const until = o.now + (o.aheadMs ?? KEEP_AHEAD_MS);
  const sink = o.sink;
  const unlinked = new Map(o.channels.map((c) => [c.id, c]));
  // Linked by a likeness of the name only: a later source that has the exact name takes them over (2.6.4).
  const loose = new Map<string, Channel>();
  /** Linked by an exact name only: a later guide's tvg-id still takes them over (a fuzzy one, its exact name too). */
  const exactOnly = new Set<string>();
  const outcomes: SourceOutcome[] = [];
  const byId = new Map(o.channels.map((c) => [c.id, c]));
  // Guide channels that have something on now or ahead. One guide per channel (2.6.6, GuidePriority): the topmost
  // that still has a programme now or ahead; a lower guide takes a channel only when the one above has run dry, and
  // never fills the gaps of another, so two schedules are never mixed.
  const live = new Set<string>();
  const dry = () => {
    const out: Channel[] = [];
    data.links.forEach((epg, chId) => { if (!live.has(epg)) { const c = byId.get(chId); if (c) out.push(c); } });
    return out;
  };

  for (const source of o.sources) {
    if ((unlinked.size === 0 && loose.size === 0 && dry().length === 0) || o.isCancelled?.()) break;
    const outcome: SourceOutcome = { source, ok: false, guideChannels: 0, linked: 0, programmes: 0 };
    outcomes.push(outcome);
    try {
      o.onProgress?.(source, "download");
      const res = await o.open(source.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const guideChannels: GuideChannel[] = [];
      const taken = new Map<string, Programme[]>();
      const pending: Array<[string, Programme]> = [];
      let wanted: Set<string> | null = null;

      const accept = (id: string, p: Programme) => {
        if (!wanted?.has(id) || p.stop <= from || p.start >= until) return;
        if (p.stop > o.now) live.add(id);
        if (sink) { sink.add(id, p); outcome.programmes++; return; }
        const list = taken.get(id);
        if (list) list.push(p); else taken.set(id, [p]);
      };

      const link = async () => {
        o.onProgress?.(source, "match");
        const ids = new Map<string, string>();
        for (const c of guideChannels) ids.set(c.id.toLowerCase(), c.id);
        await breathe();
        // One list of every name (a reduce with concat copied it once per guide channel: quadratic on a big guide).
        const names: Array<{ id: string; name?: string }> = [];
        for (const c of guideChannels) {
          if (c.names.length === 0) names.push({ id: c.id });
          for (const name of c.names) names.push({ id: c.id, name });
        }
        const index = await GuideIndex.build(names, breathe);
        // The exact names first: a name that leads to one guide channel only.
        const exact = new Map<string, string | null>();
        for (const n of names) {
          if (!n.name) continue;
          const k = exactName(n.name);
          const had = exact.get(k);
          exact.set(k, had === undefined || had === n.id ? n.id : null);
        }
        const exactOf = (name?: string) => (name ? exact.get(exactName(name)) ?? null : null);
        const found = new Set<string>();
        const iconOf = new Map(guideChannels.filter((c) => c.icon).map((c) => [c.id, c.icon as string]));
        const take = (ch: Channel, id: string) => {
          data.links.set(ch.id, id);
          found.add(id);
          const icon = iconOf.get(id);
          if (icon && !data.logos.has(id)) data.logos.set(id, icon);
          outcome.linked++;
        };
        // Those a likeness linked before: taken over by this source's tvg-id (a name match must not beat a tvg-id
        // whose guide was read later, 2.6.6) or exact name.
        for (const ch of Array.from(loose.values())) {
          const byTvg = (ch.tvgId && ids.get(ch.tvgId.toLowerCase())) || null;
          const id = byTvg ?? (exactOnly.has(ch.id) ? null : exactOf(ch.name) ?? exactOf(ch.tvgName));
          if (!id) continue;
          exactOnly.delete(ch.id);
          data.links.set(ch.id, id);
          loose.delete(ch.id);
          found.add(id);
          const icon = iconOf.get(id);
          if (icon && !data.logos.has(id)) data.logos.set(id, icon);
          outcome.linked++;
        }
        // Those whose guide above has nothing now or ahead: this source takes them whole, by any match.
        for (const ch of dry()) {
          const sure = ((ch.tvgId && ids.get(ch.tvgId.toLowerCase())) || null) ?? exactOf(ch.name) ?? exactOf(ch.tvgName);
          const id = sure ?? index.best(ch.name, AUTO_THRESHOLD)?.id ?? null;
          if (!id || id === data.links.get(ch.id)) continue;
          take(ch, id);
          loose.delete(ch.id);
          if (!sure) loose.set(ch.id, ch);
        }
        const todo = Array.from(unlinked.values());
        for (let i = 0; i < todo.length; i += MATCH_CHUNK) {
          for (const ch of todo.slice(i, i + MATCH_CHUNK)) {
            await breathe(); // a match by name can take milliseconds: the thread is given back as soon as a slice is used
            const direct = (ch.tvgId && ids.get(ch.tvgId.toLowerCase())) || null;
            const exactId = direct ? null : exactOf(ch.name) ?? exactOf(ch.tvgName);
            const sure = direct ?? exactId;
            const byName = sure ?? index.best(ch.name, AUTO_THRESHOLD)?.id ?? (ch.tvgName ? index.best(ch.tvgName, AUTO_THRESHOLD)?.id : null) ?? null;
            if (byName && !sure) loose.set(ch.id, ch);
            // A channel with a tvg-id this guide does not have: its name match holds only until a guide below has it.
            if (byName && exactId && ch.tvgId) { loose.set(ch.id, ch); exactOnly.add(ch.id); }
            if (byName) {
              data.links.set(ch.id, byName);
              unlinked.delete(ch.id);
              found.add(byName);
              const icon = iconOf.get(byName);
              if (icon && !data.logos.has(byName)) data.logos.set(byName, icon);
              outcome.linked++;
            }
          }
        }
        wanted = found;
        for (const [id, p] of pending) accept(id, p);
        pending.length = 0;
        if (outcome.linked > 0) await o.onLinked?.(data);
      };

      const scanner = new XmltvScanner({
        onChannel: (c) => guideChannels.push(c),
        onProgramme: (id, p) => (wanted === null ? pending.push([id, p]) : accept(id, p)),
        // Programmes of channels this playlist does not have, or outside the days kept, are not decoded at all.
        keep: (id, start, stop) => wanted === null || (wanted.has(id) && stop > from && start < until),
      });
      await readGuide(res, async (text) => {
        // A big piece is fed in slices, so no single parse holds the screen for long.
        for (let i = 0; i < text.length; i += FEED_SLICE) {
          scanner.feed(text.slice(i, i + FEED_SLICE));
          // All of a guide's channels precede its programmes: the first programme means the names are all in.
          if (wanted === null && scanner.sawProgramme) await link();
          if (sink?.full) await sink.flush();
          if (i + FEED_SLICE < text.length) await breathe();
        }
      });
      outcome.guideChannels = guideChannels.length;

      let done = 0;
      for (const [id, list] of Array.from(taken.entries())) {
        if (++done % 150 === 0) await breathe();
        list.sort((a, b) => a.start - b.start);
        const merged = (data.programmes.get(id) ?? []).concat(list);
        const seen = new Set<string>();
        data.programmes.set(id, merged.filter((p) => { const k = `${p.start}|${p.title}`; return seen.has(k) ? false : (seen.add(k), true); }).sort((a, b) => a.start - b.start));
        outcome.programmes += list.length;
      }
      outcome.ok = true;
    } catch (e) {
      outcome.error = e instanceof Error ? e.message : String(e);
    }
    o.onProgress?.(source, "done");
    if (outcome.ok && outcome.linked > 0) await o.onSource?.(data);
  }
  return { data, outcomes };
}
