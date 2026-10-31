import { SearchIndex, type Channel } from "@skmate/core";
import type { GuideData } from "@skmate/epg";

/**
 * Channels for a search box on a channel list: those whose name answers the query first, then those whose
 * programme on now does ("футбол" brings the channel that shows football this minute). Each channel once.
 */
export class ChannelSearch {
  private readonly byName: SearchIndex<Channel>;
  private readonly byNow: SearchIndex<Channel>;

  constructor(channels: readonly Channel[], data: GuideData, now: number) {
    this.byName = new SearchIndex(channels, (c) => c.name);
    const onAir = channels.filter((c) => data.nowNext(c.id, now).now !== null);
    this.byNow = new SearchIndex(onAir, (c) => data.nowNext(c.id, now).now?.title ?? "");
  }

  search(query: string): Channel[] {
    const named = this.byName.search(query).map((r) => r.item);
    const seen = new Set(named.map((c) => c.id));
    const aired = this.byNow.search(query).map((r) => r.item).filter((c) => !seen.has(c.id));
    return [...named, ...aired];
  }
}
