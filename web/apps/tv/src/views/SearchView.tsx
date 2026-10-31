import { useEffect, useMemo, useState } from "preact/hooks";
import { SearchIndex, type Channel } from "@skmate/core";
import { focusFirst, VirtualList } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import { useContext } from "preact/hooks";
import { UiContext } from "../state/UiContext";
import { ChannelRow } from "./ChannelRow";

interface Props {
  channels: Channel[];
  favorites: ReadonlySet<string>;
  onOpen: (c: Channel, list: readonly Channel[]) => void;
  onFav: (c: Channel) => void;
}

/** A TV is slow: the search waits for a short pause in typing instead of running on every key. */
const TYPING_PAUSE_MS = 180;
const HEIGHT = 820;

export function SearchView({ channels, favorites, onOpen, onFav }: Props) {
  const ROW = useContext(UiContext).rowH;
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  const index = useMemo(() => new SearchIndex(channels, (c) => c.name), [channels]);
  const hits = useMemo(() => index.search(settled).map((r) => r.item), [index, settled]);
  useEffect(() => { focusFirst(document, "search-input"); }, []);
  useEffect(() => {
    const id = setTimeout(() => setSettled(query), TYPING_PAUSE_MS);
    return () => clearTimeout(id);
  }, [query]);

  return (
    <div class="screen search">
      <input
        class="field"
        data-focus="search-input"
        value={query}
        placeholder={t("searchPlaceholder")}
        onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
      />
      <div class="list-head">
        {settled.trim() === "" ? t("searchHint") : hits.length === 0 ? t("searchEmpty") : t("searchResults", { n: hits.length })}
      </div>
      <VirtualList
        key={settled}
        items={hits} rowHeight={ROW} height={HEIGHT} pageSize={9}
        idOf={(c) => `ch-${c.id}`}
        renderRow={(c, i) => <ChannelRow channel={c} index={i} favorite={favorites.has(channelKey(c))} onOpen={(ch) => onOpen(ch, hits)} onFav={onFav} />}
      />
    </div>
  );
}
