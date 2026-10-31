import type { Programme } from "./xmltv";

export interface NowNext { now: Programme | null; next: Programme | null; progress: number }

/** The window of programmes kept: a little of the past (the one that is on), and a day and a half ahead. */
export const KEEP_PAST_MS = 1 * 3_600_000;
export const KEEP_AHEAD_MS = 12 * 3_600_000;

/** Descriptions are kept only for what is on the screen soon, and short: the stored guide must fit a browser's 5 MB. */
const DESC_MAX = 220;
const DESC_AHEAD_MS = 2 * 3_600_000;
const BUDGET_CHARS = 4_200_000;

/** Guide data: which guide channel each playlist channel is linked to, and the programmes of those. */
export class GuideData {
  constructor(
    readonly links: Map<string, string> = new Map(),
    readonly programmes: Map<string, Programme[]> = new Map(),
    public updatedAt = 0,
  ) {}

  of(channelId: string): Programme[] {
    const epg = this.links.get(channelId);
    return epg === undefined ? [] : this.programmes.get(epg) ?? [];
  }

  nowNext(channelId: string, at: number): NowNext {
    const list = this.of(channelId);
    let now: Programme | null = null;
    let next: Programme | null = null;
    for (const p of list) {
      if (p.start <= at && at < p.stop) now = p;
      else if (p.start > at && (next === null || p.start < next.start)) next = p;
    }
    const progress = now ? Math.min(1, Math.max(0, (at - now.start) / Math.max(1, now.stop - now.start))) : 0;
    return { now, next, progress };
  }

  get linked(): number { return this.links.size; }
  get programmeCount(): number { let n = 0; this.programmes.forEach((l) => { n += l.length; }); return n; }

  /** Drops what is long over, so the stored guide does not grow day after day. */
  prune(at: number): void {
    this.programmes.forEach((list, id) => {
      const kept = list.filter((p) => p.stop > at - KEEP_PAST_MS);
      if (kept.length === 0) this.programmes.delete(id); else this.programmes.set(id, kept);
    });
  }

  serialize(at: number = this.updatedAt): string {
    const build = (withDesc: boolean, until: number) => {
      const programmes: Record<string, Array<[number, number, string, string?]>> = {};
      this.programmes.forEach((list, id) => {
        const rows = list.filter((p) => p.start < until).map((p): [number, number, string, string?] =>
          withDesc && p.desc && p.start < at + DESC_AHEAD_MS && p.stop > at - KEEP_PAST_MS ? [p.start, p.stop, p.title, p.desc.slice(0, DESC_MAX)] : [p.start, p.stop, p.title]);
        if (rows.length > 0) programmes[id] = rows;
      });
      return JSON.stringify({ v: 1, at: this.updatedAt, links: Array.from(this.links), programmes });
    };
    // Over budget: first the descriptions go, then the far end of the day.
    for (const [withDesc, hours] of [[true, 12], [false, 12], [false, 6], [false, 3]] as const) {
      const json = build(withDesc, at + hours * 3_600_000);
      if (json.length <= BUDGET_CHARS) return json;
    }
    return build(false, at + 2 * 3_600_000);
  }

  static restore(json: string | null): GuideData {
    if (!json) return new GuideData();
    try {
      const o = JSON.parse(json) as { v?: number; at?: number; links?: Array<[string, string]>; programmes?: Record<string, Array<[number, number, string, string?]>> };
      if (o.v !== 1) return new GuideData();
      const programmes = new Map<string, Programme[]>();
      for (const [id, list] of Object.entries(o.programmes ?? {})) {
        programmes.set(id, list.map(([start, stop, title, desc]) => ({ start, stop, title, desc })));
      }
      return new GuideData(new Map(o.links ?? []), programmes, o.at ?? 0);
    } catch {
      return new GuideData(); // a damaged cache is just an empty one
    }
  }
}
