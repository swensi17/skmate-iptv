import { SearchIndex, type Channel } from "@skmate/core";
import type { GuideData, Programme } from "@skmate/epg";

export interface ProgrammeHit { channel: Channel; programme: Programme; rank: number; live: boolean }

interface Entry { channel: Channel; programme: Programme }

/**
 * Search through the programme guide: every programme that has not ended yet, of every channel that has a guide,
 * found by title in any layout and with typos (the same index as for channel names). A guide channel shared by
 * several playlist channels (HD and SD of one channel) is reported once, under the first of them.
 */
export class ProgrammeSearch {
  private readonly index: SearchIndex<Entry>;
  size = 0;

  constructor(data: GuideData, channels: readonly Channel[], now: number) {
    const firstOf = new Map<string, Channel>();
    for (const c of channels) {
      const epg = data.links.get(c.id);
      if (epg !== undefined && !firstOf.has(epg)) firstOf.set(epg, c);
    }
    const entries: Entry[] = [];
    firstOf.forEach((channel, epg) => {
      for (const programme of data.programmes.get(epg) ?? []) if (programme.stop > now) entries.push({ channel, programme });
    });
    this.size = entries.length;
    this.index = new SearchIndex(entries, (e) => e.programme.title);
  }

  /** Best title matches first; among equals, what is on now, then what comes soonest. */
  search(query: string, now: number, limit = 200): ProgrammeHit[] {
    return this.index
      .search(query)
      .map((r) => ({ channel: r.item.channel, programme: r.item.programme, rank: r.rank, live: r.item.programme.start <= now }))
      .sort((a, b) => a.rank - b.rank || Number(b.live) - Number(a.live) || a.programme.start - b.programme.start)
      .slice(0, limit);
  }
}
