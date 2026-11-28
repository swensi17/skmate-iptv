import type { Programme } from "./xmltv";

export interface NowNext { now: Programme | null; next: Programme | null; progress: number }

/**
 * The window the localStorage copy keeps (the fallback where there is no IndexedDB): a little of the past (the one
 * that is on) and half a day ahead. With IndexedDB the guide keeps the days chosen in Settings (see cache.ts).
 */
export const KEEP_PAST_MS = 1 * 3_600_000;
export const KEEP_AHEAD_MS = 12 * 3_600_000;

/** What stands behind a guide kept in IndexedDB: the parts not in memory, fetched when they are wanted. */
export interface GuideBacking {
  /** The grid reached [from]..[to]: those programmes are read in, and come as a new GuideData. */
  need(from: number, to: number): void;
  /** The description of the programme of guide channel [epgId] starting at [start] (display time). */
  describe(epgId: string, start: number): Promise<string | undefined>;
  /** Programmes of the whole stored guide whose title holds the words (see GuideCache.findTitles). */
  find?(query: string, limit?: number): Promise<Array<{ epg: string; programme: Programme }>>;
}

export interface GuideExtent {
  /** The last instant the stored guide reaches (more than what is in memory now); 0 when only memory counts. */
  horizon?: number;
  /** The guide channels that have programmes stored, in memory or not. */
  stored?: ReadonlySet<string>;
  /** Minutes every programme is moved by (Settings › guide time shift); already applied to the programmes. */
  shiftMin?: number;
  backing?: GuideBacking;
}

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
    /** Logo address by guide channel id: the logos a playlist without `tvg-logo` lacks. */
    readonly logos: Map<string, string> = new Map(),
    private readonly extent: GuideExtent = {},
  ) {}

  /** See [GuideExtent.horizon]. */
  get horizon(): number { return this.extent.horizon ?? 0; }
  get shiftMin(): number { return this.extent.shiftMin ?? 0; }

  /** Whether the channel has a guide at all, also when none of it is in memory right now (a later day only). */
  stored(channelId: string): boolean {
    const epg = this.links.get(channelId);
    if (epg === undefined) return false;
    const list = this.programmes.get(epg);
    return (list !== undefined && list.length > 0) || (this.extent.stored?.has(epg) ?? false);
  }

  /** Asks for the programmes of [from]..[to] (a guide kept in IndexedDB reads them in; otherwise nothing to do). */
  need(from: number, to: number): void { this.extent.backing?.need(from, to); }

  /** The programme's description: at hand for what is on soon, read from storage for the rest. */
  describe(channelId: string, p: Programme): Promise<string | undefined> {
    if (p.desc) return Promise.resolve(p.desc);
    const epg = this.links.get(channelId);
    const backing = this.extent.backing;
    if (epg === undefined || !backing) return Promise.resolve(undefined);
    return backing.describe(epg, p.start).catch(() => undefined);
  }

  /** Programmes of the stored guide (not only those in memory) whose title holds [query], by playlist channel. */
  async findStored(query: string, limit = 300): Promise<Array<{ channelId: string; programme: Programme }>> {
    const find = this.extent.backing?.find;
    if (!find) return [];
    const byEpg = new Map<string, string>();
    this.links.forEach((epg, ch) => { if (!byEpg.has(epg)) byEpg.set(epg, ch); });
    let found: Array<{ epg: string; programme: Programme }> = [];
    try { found = await find(query, limit); } catch { /* storage unreadable: nothing more found */ }
    const out: Array<{ channelId: string; programme: Programme }> = [];
    for (const f of found) { const ch = byEpg.get(f.epg); if (ch) out.push({ channelId: ch, programme: f.programme }); }
    return out;
  }

  /** The same guide moved to a shift of [minutes] (the in-memory guide; one kept in IndexedDB re-reads instead). */
  withShift(minutes: number): GuideData {
    const delta = (minutes - this.shiftMin) * 60_000;
    if (delta === 0) return this;
    const moved = new Map<string, Programme[]>();
    this.programmes.forEach((list, id) => moved.set(id, list.map((p) => ({ start: p.start + delta, stop: p.stop + delta, title: p.title, desc: p.desc }))));
    return new GuideData(this.links, moved, this.updatedAt, this.logos, { ...this.extent, shiftMin: minutes });
  }

  of(channelId: string): Programme[] {
    const epg = this.links.get(channelId);
    return epg === undefined ? [] : this.programmes.get(epg) ?? [];
  }

  /** The logo the guide gives the channel linked to [channelId], if any. */
  logoOf(channelId: string): string | undefined {
    const epg = this.links.get(channelId);
    return epg === undefined ? undefined : this.logos.get(epg);
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

  /** The compact copy for localStorage, kept without the shift (it is applied again after reading). */
  serialize(at: number = this.updatedAt): string {
    if (this.shiftMin !== 0) return this.withShift(0).serialize(at);
    const build = (withDesc: boolean, until: number) => {
      const programmes: Record<string, Array<[number, number, string, string?]>> = {};
      this.programmes.forEach((list, id) => {
        const rows = list.filter((p) => p.start < until).map((p): [number, number, string, string?] =>
          withDesc && p.desc && p.start < at + DESC_AHEAD_MS && p.stop > at - KEEP_PAST_MS ? [p.start, p.stop, p.title, p.desc.slice(0, DESC_MAX)] : [p.start, p.stop, p.title]);
        if (rows.length > 0) programmes[id] = rows;
      });
      const logos: Record<string, string> = {};
      this.links.forEach((epg) => { const l = this.logos.get(epg); if (l) logos[epg] = l; });
      return JSON.stringify({ v: 2, at: this.updatedAt, links: Array.from(this.links), programmes, logos });
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
      const o = JSON.parse(json) as { v?: number; at?: number; links?: Array<[string, string]>; programmes?: Record<string, Array<[number, number, string, string?]>>; logos?: Record<string, string> };
      // v1 had no logos: it counts as empty, so the next start downloads the guide again and brings them.
      if (o.v !== 2) return new GuideData();
      const programmes = new Map<string, Programme[]>();
      for (const [id, list] of Object.entries(o.programmes ?? {})) {
        programmes.set(id, list.map(([start, stop, title, desc]) => ({ start, stop, title, desc })));
      }
      return new GuideData(new Map(o.links ?? []), programmes, o.at ?? 0, new Map(Object.entries(o.logos ?? {})));
    } catch {
      return new GuideData(); // a damaged cache is just an empty one
    }
  }
}
