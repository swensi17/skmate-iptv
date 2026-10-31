import type { Channel } from "@skmate/core";
import { AUTO_THRESHOLD, GuideIndex } from "./match";
import { GuideData, KEEP_AHEAD_MS, KEEP_PAST_MS } from "./store";
import { readGuide } from "./stream";
import { XmltvScanner, type GuideChannel, type Programme } from "./xmltv";

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
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const MATCH_CHUNK = 120;

/**
 * Fills the guide for [channels] from [sources] in order, as the Android app does: a source links the channels
 * the earlier ones left (by guide id first, then by name), and only the programmes of channels it linked are
 * kept. Sources are not all read once the channels are all linked. Never throws: a failing source is reported.
 */
export async function syncGuides(o: SyncOptions): Promise<{ data: GuideData; outcomes: SourceOutcome[] }> {
  const data = new GuideData(new Map(), new Map(), o.now);
  const unlinked = new Map(o.channels.map((c) => [c.id, c]));
  const outcomes: SourceOutcome[] = [];

  for (const source of o.sources) {
    if (unlinked.size === 0 || o.isCancelled?.()) break;
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
        if (!wanted?.has(id) || p.stop <= o.now - KEEP_PAST_MS || p.start >= o.now + KEEP_AHEAD_MS) return;
        const list = taken.get(id);
        if (list) list.push(p); else taken.set(id, [p]);
      };

      const link = async () => {
        o.onProgress?.(source, "match");
        const ids = new Map(guideChannels.map((c) => [c.id.toLowerCase(), c.id]));
        const index = new GuideIndex(guideChannels.reduce<Array<{ id: string; name?: string }>>(
          (all, c) => all.concat(c.names.length > 0 ? c.names.map((name) => ({ id: c.id, name })) : [{ id: c.id }]), []));
        const found = new Set<string>();
        const todo = Array.from(unlinked.values());
        for (let i = 0; i < todo.length; i += MATCH_CHUNK) {
          for (const ch of todo.slice(i, i + MATCH_CHUNK)) {
            const direct = (ch.tvgId && ids.get(ch.tvgId.toLowerCase())) || null;
            const byName = direct ?? index.best(ch.name, AUTO_THRESHOLD)?.id ?? (ch.tvgName ? index.best(ch.tvgName, AUTO_THRESHOLD)?.id : null) ?? null;
            if (byName) {
              data.links.set(ch.id, byName);
              unlinked.delete(ch.id);
              found.add(byName);
              outcome.linked++;
            }
          }
          await tick();
        }
        wanted = found;
        for (const [id, p] of pending) accept(id, p);
        pending.length = 0;
      };

      const scanner = new XmltvScanner({
        onChannel: (c) => guideChannels.push(c),
        onProgramme: (id, p) => (wanted === null ? pending.push([id, p]) : accept(id, p)),
      });
      await readGuide(res, async (text) => {
        scanner.feed(text);
        // All of a guide's channels precede its programmes: the first programme means the names are all in.
        if (wanted === null && scanner.sawProgramme) await link();
      });
      outcome.guideChannels = guideChannels.length;

      taken.forEach((list, id) => {
        list.sort((a, b) => a.start - b.start);
        const merged = (data.programmes.get(id) ?? []).concat(list);
        const seen = new Set<string>();
        data.programmes.set(id, merged.filter((p) => { const k = `${p.start}|${p.title}`; return seen.has(k) ? false : (seen.add(k), true); }).sort((a, b) => a.start - b.start));
        outcome.programmes += list.length;
      });
      outcome.ok = true;
    } catch (e) {
      outcome.error = e instanceof Error ? e.message : String(e);
    }
    o.onProgress?.(source, "done");
  }
  return { data, outcomes };
}
