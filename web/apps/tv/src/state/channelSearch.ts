import { SearchIndex, type Channel } from "@skmate/core";
import type { GuideData } from "@skmate/epg";

/**
 * Channels for a search box on a channel list: those whose name answers the query first, then those whose
 * programme on now does ("футбол" brings the channel that shows football this minute). Each channel once.
 */
export class ChannelSearch {
  // Built on the first search, not when the list changes: normalising thousands of names (and asking the guide what is on
  // air for each) on every category switch or minute tick was seconds of work on a TV for a search nobody asked for.
  private byName: SearchIndex<Channel> | null = null;
  private byNow: SearchIndex<Channel> | null = null;

  constructor(private readonly channels: readonly Channel[], private readonly data: GuideData, private readonly now: number) {}

  private indexes(): { byName: SearchIndex<Channel>; byNow: SearchIndex<Channel> } {
    if (!this.byName || !this.byNow) {
      const { channels, data, now } = this;
      this.byName = new SearchIndex(channels, (c) => c.name);
      const onAir = channels.filter((c) => data.nowNext(c.id, now).now !== null);
      this.byNow = new SearchIndex(onAir, (c) => data.nowNext(c.id, now).now?.title ?? "");
    }
    return { byName: this.byName, byNow: this.byNow };
  }

  search(query: string): Channel[] {
    const { byName, byNow } = this.indexes();
    const named = byName.search(query).map((r) => r.item);
    const seen = new Set(named.map((c) => c.id));
    const aired = byNow.search(query).map((r) => r.item).filter((c) => !seen.has(c.id));
    return [...named, ...aired];
  }

  /** [search] in slices (see SearchIndex.searchSliced); null when [cancelled] turned true. */
  async searchSliced(query: string, pause: () => Promise<void>, cancelled?: () => boolean): Promise<Channel[] | null> {
    const { byName, byNow } = this.indexes();
    const opts = cancelled ? { cancelled } : {};
    const a = await byName.searchSliced(query, pause, opts);
    if (!a) return null;
    await pause();
    const b = await byNow.searchSliced(query, pause, opts);
    if (!b) return null;
    const named = a.map((r) => r.item);
    const seen = new Set(named.map((c) => c.id));
    return [...named, ...b.map((r) => r.item).filter((c) => !seen.has(c.id))];
  }
}
