import { isQuotaError, prefixRange, type GuideKv, type KeyRange } from "./kv";
import { GuideData, type GuideBacking } from "./store";
import type { GuideSink } from "./sync";
import type { Programme } from "./xmltv";
import { breathe } from "./yielder";

/*
 * The guide kept in IndexedDB, as the Android app keeps it in its database: every day the viewer chose (Settings ›
 * days of guide kept, 7 by default), written while the guide downloads and read back a few hours at a time.
 *
 * Memory stays a function of the screen, not of the catalogue (Android EpgViewModel's row cache): what is on and the
 * next day are in memory for the home screen, the lists and the player; the grid asks for the hours it scrolls to,
 * and hours it has left are dropped again. Descriptions, the bulk of a guide, stay on disk except for what is on soon.
 *
 * Layout, one IndexedDB store of string keys (pid = playlist, gen = the download that wrote it):
 *   m|pid                          GuideMeta: links, logos, which blocks hold rows
 *   b|pid|gen|block|seq            programmes ending in that 6-hour block, from one batch of the download
 *   x|pid|gen|slot|group|seq       descriptions of programmes starting in that 3-hour slot, a quarter of the channels
 * A new download writes its own gen, and its last write swaps the meta and drops every other gen at once.
 */

const HOUR = 3_600_000;
export const DAY_MS = 24 * HOUR;
/** Programmes are stored by the 6-hour block they end in: the smallest piece read into memory. */
export const BLOCK_MS = 6 * HOUR;
/** Descriptions by the 3-hour slot they start in, a quarter of the channels per record. */
export const SLOT_MS = 3 * HOUR;
export const DESC_GROUPS = 4;
/** A description is kept whole up to this length (#883: shown in full now); only a runaway text is cut. */
export const DESC_MAX = 1500;
/** A programme that is over stays stored this long (Android RECENT_PAST_MS)... */
export const STORED_PAST_MS = 6 * HOUR;
/** ...and in memory this long: the grid shows two hours back. */
export const MEMORY_PAST_MS = 3 * HOUR;
/** Always in memory, whatever the grid shows: what is on and the day after (home, lists, player, search). */
export const BASE_AHEAD_MS = 30 * HOUR;
/** Descriptions are in memory for what is on now and starts within this. */
export const NEAR_DESC_MS = 3 * HOUR;
/** The download writes a batch every this many programmes: memory while a week of guide arrives stays small. */
const FLUSH_AT = 5_000;
/** Records per IndexedDB transaction while a download is written: each is one short task, the remote in between. */
const PUTS_PER_TASK = 6;
/** Description tables kept for the guide's cursor (one is about a megabyte). */
const DESC_TABLES = 2;

export const blockOf = (stop: number): number => Math.floor((stop - 1) / BLOCK_MS);
export const slotOf = (start: number): number => Math.floor(start / SLOT_MS);
export function groupOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h >>> 0) % DESC_GROUPS;
}

/** A stored record: channel ids and, at the same index, that channel's flat rows. */
interface Rec { ids: string[]; rows: Array<Array<number | string>> }

export interface GuideMeta {
  v: 3;
  gen: number;
  /** When the guide was downloaded. */
  at: number;
  /** The days kept the download was asked for. */
  days: number;
  links: Array<[string, string]>;
  logos: Array<[string, string]>;
  /** Guide channels that have programmes. */
  ids: string[];
  /** Blocks that hold programmes. */
  blocks: number[];
  /** The last programme's end. */
  until: number;
  /** How far back aired programmes were kept (the archive's depth, 2.6.3); missing: the 6 hours before it. */
  past?: number;
  /** Which channels the links were made for (a fingerprint of their ids): another set links again (2.6.9). */
  chans?: string;
  /** A first guide still downloading when it was kept (#perf): shown at the next start, and downloaded again. */
  partial?: boolean;
  /** Whether descriptions were written (dropped when the disk was full). */
  desc: boolean;
}

const safe = (pid: string) => pid.replace(/\|/g, "_");
const metaKey = (pid: string) => `m|${safe(pid)}`;
const rowsPrefix = (pid: string) => `b|${safe(pid)}|`;
const descPrefix = (pid: string) => `x|${safe(pid)}|`;

/**
 * The gens under [prefix] older than [gen]: what a finished download drops. A newer one may still be writing (a
 * second window of the app downloading the same guide) and is left alone; it drops this one when it finishes.
 * Gens are millisecond times, all of 13 digits, so their text sorts as their number does.
 */
function olderThan(prefix: string, gen: number): KeyRange[] {
  return [[prefix, `${prefix}${gen}|`]];
}

function pack(m: Map<string, Array<number | string>>): Rec {
  const rec: Rec = { ids: [], rows: [] };
  m.forEach((rows, id) => { rec.ids.push(id); rec.rows.push(rows); });
  return rec;
}

function isRec(v: unknown): v is Rec {
  const r = v as Rec | null;
  return !!r && Array.isArray(r.ids) && Array.isArray(r.rows);
}

/**
 * Takes the programmes of a download ([syncGuides]'s sink) and writes them in batches under a new gen; [commit]
 * makes them the guide, [abort] throws them away. A full disk costs the descriptions, not the guide.
 */
export class GuideWriter implements GuideSink {
  private blocks = new Map<number, Map<string, Array<number | string>>>();
  private descs = new Map<string, Map<string, Array<number | string>>>();
  private seq = 0;
  private count = 0;
  private withDesc = true;
  private readonly ids = new Set<string>();
  private readonly blockSet = new Set<number>();
  private until = 0;
  /** Programmes written so far (tests, logs). */
  written = 0;

  /** How far back the download kept aired programmes; written into the meta. */
  past = STORED_PAST_MS;
  /** See [GuideMeta.chans]. */
  chans = "";

  constructor(private readonly kv: GuideKv, private readonly pid: string, readonly gen: number = Date.now()) {}

  add(id: string, p: Programme): void {
    const block = blockOf(p.stop);
    let rows = this.blocks.get(block);
    if (!rows) this.blocks.set(block, (rows = new Map()));
    const flat = rows.get(id);
    if (flat) flat.push(p.start, p.stop, p.title); else rows.set(id, [p.start, p.stop, p.title]);
    if (this.withDesc && p.desc) {
      const key = `${slotOf(p.start)}|${groupOf(id)}`;
      let d = this.descs.get(key);
      if (!d) this.descs.set(key, (d = new Map()));
      const text = p.desc.length > DESC_MAX ? `${p.desc.slice(0, DESC_MAX - 1)}…` : p.desc;
      const list = d.get(id);
      if (list) list.push(p.start, text); else d.set(id, [p.start, text]);
    }
    this.ids.add(id);
    this.blockSet.add(block);
    if (p.stop > this.until) this.until = p.stop;
    this.count++;
  }

  get full(): boolean { return this.count >= FLUSH_AT; }

  async flush(): Promise<void> {
    if (this.count === 0) return;
    const seq = this.seq++;
    const pid = safe(this.pid);
    const rows: Array<[string, unknown]> = [];
    const descs: Array<[string, unknown]> = [];
    this.blocks.forEach((m, b) => rows.push([`b|${pid}|${this.gen}|${b}|${seq}`, pack(m)]));
    this.descs.forEach((m, k) => descs.push([`x|${pid}|${this.gen}|${k}|${seq}`, pack(m)]));
    this.written += this.count;
    this.blocks = new Map();
    this.descs = new Map();
    this.count = 0;
    try {
      const all = this.withDesc ? rows.concat(descs) : rows;
      for (let i = 0; i < all.length; i += PUTS_PER_TASK) {
        if (i > 0) await breathe();
        await this.kv.write(all.slice(i, i + PUTS_PER_TASK));
      }
    } catch (e) {
      if (!isQuotaError(e) || !this.withDesc) throw e;
      // The disk is full: every description goes (the old guide's too), the programmes still fit.
      this.withDesc = false;
      await this.kv.write(rows, [prefixRange(descPrefix(this.pid))]);
    }
  }

  /**
   * What is written so far as a guide that can be read (not stored as the playlist's guide): with nothing stored yet,
   * the first source's channels are shown while the next sources still download. Call after [flush].
   */
  draft(links: Map<string, string>, logos: Map<string, string>, at: number, days: number): GuideMeta {
    return this.metaOf(links, logos, at, days);
  }

  private metaOf(links: Map<string, string>, logos: Map<string, string>, at: number, days: number): GuideMeta {
    const usedLogos: Array<[string, string]> = [];
    const epgs = new Set(Array.from(links.values()));
    logos.forEach((url, id) => { if (epgs.has(id)) usedLogos.push([id, url]); });
    return {
      v: 3, gen: this.gen, at, days, links: Array.from(links), logos: usedLogos,
      ids: Array.from(this.ids), blocks: Array.from(this.blockSet).sort((a, b) => a - b), until: this.until, desc: this.withDesc,
      past: this.past, chans: this.chans,
    };
  }

  /**
   * Makes what was written the guide of the playlist, and drops the guide it replaces. When a newer download has
   * finished meanwhile (another window of the app), that one stays the guide and this one is dropped instead.
   */
  async commit(links: Map<string, string>, logos: Map<string, string>, at: number, days: number): Promise<GuideMeta> {
    await this.flush();
    const current = await readGuideMeta(this.kv, this.pid);
    if (current && current.gen > this.gen) { await this.abort(); return current; }
    const meta = this.metaOf(links, logos, at, days);
    await this.kv.write([[metaKey(this.pid), meta]], olderThan(rowsPrefix(this.pid), this.gen).concat(olderThan(descPrefix(this.pid), this.gen)));
    return meta;
  }

  /**
   * Keeps what is written so far as the playlist's guide while there is no complete one: an app closed during its
   * first download shows these channels at the next start instead of downloading everything again before any shows.
   */
  async keepDraft(links: Map<string, string>, logos: Map<string, string>, at: number, days: number): Promise<void> {
    const current = await readGuideMeta(this.kv, this.pid);
    if (current && !current.partial) return; // a complete guide stays until this one is committed
    await this.kv.write([[metaKey(this.pid), { ...this.metaOf(links, logos, at, days), partial: true }]]);
  }

  /** A download that failed or found nothing: what it wrote goes, the old guide stays. */
  async abort(): Promise<void> {
    const pid = safe(this.pid);
    const current = await readGuideMeta(this.kv, this.pid).catch(() => null);
    const drop = current?.partial && current.gen === this.gen ? [prefixRange(metaKey(this.pid))] : [];
    return this.kv.write([], [prefixRange(`b|${pid}|${this.gen}|`), prefixRange(`x|${pid}|${this.gen}|`), ...drop]);
  }
}

/** The stored guide of [pid], or null when there is none (or one from an older version). */
export async function readGuideMeta(kv: GuideKv, pid: string): Promise<GuideMeta | null> {
  const m = await kv.get<GuideMeta>(metaKey(pid));
  return m && m.v === 3 && Array.isArray(m.links) && Array.isArray(m.blocks) ? m : null;
}

/** Forgets the stored guide of [pid] entirely. */
export function clearStoredGuide(kv: GuideKv, pid: string): Promise<void> {
  return kv.write([], [prefixRange(metaKey(pid)), prefixRange(rowsPrefix(pid)), prefixRange(descPrefix(pid))]);
}

/** Sorts a channel's programmes by start where pieces met out of order, and drops the same programme twice. */
function tidy(list: Programme[]): Programme[] {
  let sorted = true;
  for (let i = 1; i < list.length; i++) if ((list[i] as Programme).start < (list[i - 1] as Programme).start) { sorted = false; break; }
  const src = sorted ? list : list.slice().sort((a, b) => a.start - b.start);
  let dup = false;
  for (let i = 1; i < src.length && !dup; i++) {
    const p = src[i] as Programme;
    for (let j = i - 1; j >= 0 && (src[j] as Programme).start === p.start; j--) if ((src[j] as Programme).title === p.title) { dup = true; break; }
  }
  if (!dup) return src;
  const out: Programme[] = [];
  for (const p of src) {
    let seen = false;
    for (let j = out.length - 1; j >= 0 && (out[j] as Programme).start === p.start; j--) if ((out[j] as Programme).title === p.title) { seen = true; break; }
    if (!seen) out.push(p);
  }
  return out;
}

/**
 * The stored guide of one playlist as it is read: the blocks in memory (already moved by the time shift), the
 * descriptions of what is on soon, and the [GuideData] the screens get. Every change goes through one queue, so a
 * scroll, a shift and the clock never read the same block twice at once.
 */
export class GuideCache {
  private readonly pieces = new Map<number, Map<string, Programme[]>>();
  private readonly blocks: Set<number>;
  private readonly stored: Set<string>;
  private readonly links: Map<string, string>;
  private readonly logos: Map<string, string>;
  private readonly tables = new Map<string, Promise<Map<string, Map<number, string>>>>();
  private near: Programme[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  /** Programmes in memory now (tests, logs). */
  inMemory = 0;

  constructor(
    private readonly kv: GuideKv, private readonly pid: string, readonly meta: GuideMeta,
    private shiftMin = 0, private days = 7,
  ) {
    this.blocks = new Set(meta.blocks);
    this.stored = new Set(meta.ids);
    this.links = new Map(meta.links);
    this.logos = new Map(meta.logos);
  }

  /** Stops every read still queued (the playlist changed, or a new download replaced this guide). */
  close(): void { this.closed = true; }

  get shift(): number { return this.shiftMin; }

  private run<T>(f: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => (this.closed ? (false as unknown as T) : f()));
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** The end of what may be shown: the stored guide's end, but no further than the days kept. */
  horizon(now: number): number {
    return Math.min(this.meta.until + this.shiftMin * 60_000, now + this.days * DAY_MS);
  }

  setDays(days: number): void { this.days = days; }

  /**
   * Holds in memory the programmes that reach into each of [ranges] (display time), and nothing else. Resolves
   * true when that changed what is in memory.
   */
  ensure(ranges: ReadonlyArray<[number, number]>, now: number): Promise<boolean> {
    return this.run(async () => {
      const shift = this.shiftMin * 60_000;
      const limit = now + this.days * DAY_MS;
      const wanted = new Set<number>();
      for (const [from, to] of ranges) {
        const end = Math.min(to, limit) - shift;
        for (let b = Math.floor((from - shift) / BLOCK_MS); b <= blockOf(end + BLOCK_MS); b++) if (this.blocks.has(b)) wanted.add(b);
      }
      let changed = false;
      for (const b of Array.from(this.pieces.keys())) if (!wanted.has(b)) { this.pieces.delete(b); changed = true; }
      const missing = Array.from(wanted).filter((b) => !this.pieces.has(b)).sort((a, b) => a - b);
      for (const b of missing) {
        if (this.closed) return false;
        this.pieces.set(b, await this.readBlock(b, now));
        changed = true;
      }
      return changed;
    });
  }

  /**
   * Programmes of the whole stored guide whose title holds [query] (lower case, ё as е), read straight from storage
   * and never kept: a search finds a series later in the week or in the archive without a week in memory (#752).
   */
  async findTitles(query: string, limit = 300): Promise<Array<{ epg: string; programme: Programme }>> {
    const q = query.toLowerCase().replace(/ё/g, "е").trim();
    const out: Array<{ epg: string; programme: Programme }> = [];
    if (q.length < 2) return out;
    const shift = this.shiftMin * 60_000;
    await this.kv.scan(`b|${safe(this.pid)}|${this.meta.gen}|`, (_k, v) => {
      if (!isRec(v) || out.length >= limit) return;
      for (let i = 0; i < v.ids.length && out.length < limit; i++) {
        const flat = v.rows[i] ?? [];
        for (let j = 0; j + 2 < flat.length; j += 3) {
          const title = String(flat[j + 2]);
          if (title.toLowerCase().replace(/ё/g, "е").indexOf(q) < 0) continue;
          out.push({ epg: v.ids[i] as string, programme: { start: (flat[j] as number) + shift, stop: (flat[j + 1] as number) + shift, title } });
          if (out.length >= limit) break;
        }
      }
    });
    return out;
  }

  private async readBlock(block: number, now: number): Promise<Map<string, Programme[]>> {
    const shift = this.shiftMin * 60_000;
    // A block asked for is read whole as far back as the guide keeps: the archive's days come with it (2.6.3).
    const after = now - Math.max(MEMORY_PAST_MS, this.meta.past ?? 0);
    const out = new Map<string, Programme[]>();
    await this.kv.scan(`b|${safe(this.pid)}|${this.meta.gen}|${block}|`, (_k, v) => {
      if (!isRec(v)) return;
      for (let i = 0; i < v.ids.length; i++) {
        const id = v.ids[i] as string;
        const flat = v.rows[i] ?? [];
        let list = out.get(id);
        for (let j = 0; j + 2 < flat.length; j += 3) {
          const stop = (flat[j + 1] as number) + shift;
          if (stop <= after) continue;
          if (!list) out.set(id, (list = []));
          list.push({ start: (flat[j] as number) + shift, stop, title: String(flat[j + 2]) });
        }
      }
    });
    out.forEach((list, id) => out.set(id, tidy(list)));
    return out;
  }

  /** Moves the guide to [minutes] of shift (Settings › guide time shift). True when that changed it. */
  setShift(minutes: number): Promise<boolean> {
    return this.run(async () => {
      const delta = (minutes - this.shiftMin) * 60_000;
      if (delta === 0) return false;
      this.shiftMin = minutes;
      this.pieces.forEach((m) => m.forEach((list, id) => m.set(id, list.map((p) => ({ start: p.start + delta, stop: p.stop + delta, title: p.title })))));
      this.near = [];
      this.tables.clear();
      return true;
    });
  }

  /**
   * Gives what is on now and soon its description (the home screen and the lists show it), and takes it from
   * what is no longer soon. True when that changed anything.
   */
  refreshNear(now: number): Promise<boolean> {
    return this.run(async () => {
      if (!this.meta.desc) return false;
      const shift = this.shiftMin * 60_000;
      const until = now + NEAR_DESC_MS;
      // The programmes that should carry a description: on now, or starting within NEAR_DESC_MS.
      const want = new Map<string, Map<number, Programme>>();
      let earliest = now;
      this.pieces.forEach((m) => m.forEach((list, id) => {
        for (const p of list) {
          if (p.stop <= now || p.start >= until) continue;
          let byStart = want.get(id);
          if (!byStart) want.set(id, (byStart = new Map()));
          byStart.set(p.start - shift, p);
          if (p.start < earliest) earliest = p.start;
        }
      }));
      const before = this.near;
      const next: Programme[] = [];
      for (let slot = slotOf(earliest - shift); slot <= slotOf(until - shift); slot++) {
        if (this.closed) return false;
        await this.kv.scan(`x|${safe(this.pid)}|${this.meta.gen}|${slot}|`, (_k, v) => {
          if (!isRec(v)) return;
          for (let i = 0; i < v.ids.length; i++) {
            const byStart = want.get(v.ids[i] as string);
            if (!byStart) continue;
            const flat = v.rows[i] ?? [];
            for (let j = 0; j + 1 < flat.length; j += 2) {
              const p = byStart.get(flat[j] as number);
              if (p && !p.desc) { p.desc = String(flat[j + 1]); next.push(p); }
            }
          }
        });
      }
      const keep = new Set(next);
      let changed = next.length > 0;
      for (const p of before) {
        if (p.stop > now && p.start < until) { keep.add(p); next.push(p); continue; }
        if (!keep.has(p) && p.desc !== undefined) { delete p.desc; changed = true; }
      }
      this.near = next;
      return changed;
    });
  }

  /** The description of a programme of guide channel [epgId] starting at [start] (display time). */
  describe(epgId: string, start: number): Promise<string | undefined> {
    if (!this.meta.desc) return Promise.resolve(undefined);
    const raw = start - this.shiftMin * 60_000;
    const key = `${slotOf(raw)}|${groupOf(epgId)}`;
    let table = this.tables.get(key);
    if (!table) {
      table = this.readTable(key);
      this.tables.set(key, table);
      if (this.tables.size > DESC_TABLES) this.tables.delete(this.tables.keys().next().value as string);
    }
    return table.then((t) => t.get(epgId)?.get(raw));
  }

  private async readTable(key: string): Promise<Map<string, Map<number, string>>> {
    const out = new Map<string, Map<number, string>>();
    await this.kv.scan(`x|${safe(this.pid)}|${this.meta.gen}|${key}|`, (_k, v) => {
      if (!isRec(v)) return;
      for (let i = 0; i < v.ids.length; i++) {
        const id = v.ids[i] as string;
        let m = out.get(id);
        if (!m) out.set(id, (m = new Map()));
        const flat = v.rows[i] ?? [];
        for (let j = 0; j + 1 < flat.length; j += 2) m.set(flat[j] as number, String(flat[j + 1]));
      }
    });
    return out;
  }

  /**
   * The guide as the screens see it: the blocks in memory joined channel by channel. [onNeed] hears when the grid
   * asks for hours that are not in memory (the owner then calls [ensure] and takes a new snapshot).
   */
  snapshot(now: number, onNeed?: (from: number, to: number) => void): GuideData {
    const backing: GuideBacking = { need: (from, to) => onNeed?.(from, to), describe: (epg, start) => this.describe(epg, start), find: (q, limit) => this.findTitles(q, limit) };
    const merged = new Map<string, Programme[]>();
    const owned = new Set<string>();
    const order = Array.from(this.pieces.keys()).sort((a, b) => a - b);
    for (const b of order) {
      (this.pieces.get(b) as Map<string, Programme[]>).forEach((list, id) => {
        const prev = merged.get(id);
        if (!prev) { merged.set(id, list); return; }
        if (owned.has(id)) { for (const p of list) prev.push(p); return; }
        merged.set(id, prev.concat(list));
        owned.add(id);
      });
    }
    let count = 0;
    owned.forEach((id) => merged.set(id, tidy(merged.get(id) as Programme[])));
    merged.forEach((l) => { count += l.length; });
    this.inMemory = count;
    return new GuideData(this.links, merged, this.meta.at, this.logos, {
      horizon: this.horizon(now), stored: this.stored, shiftMin: this.shiftMin, backing,
    });
  }
}
