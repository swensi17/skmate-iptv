import { useEffect, useMemo, useState } from "preact/hooks";
import { searchBy, type Channel } from "@skmate/core";
import { focusFirst } from "@skmate/ui";
import { t } from "../i18n";
import { ChannelRow } from "./ChannelRow";

export function SearchView({ channels, onOpen }: { channels: Channel[]; onOpen: (c: Channel) => void }) {
  const [query, setQuery] = useState("");
  const hits = useMemo(() => searchBy(channels, query, (c) => c.name).map((r) => r.item), [channels, query]);
  useEffect(() => { focusFirst(document, "search-input"); }, []);

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
        {query.trim() === "" ? t("searchHint") : hits.length === 0 ? t("searchEmpty") : t("searchResults", { n: hits.length })}
      </div>
      <div class="scroll">
        {hits.map((c, i) => <ChannelRow key={c.id} channel={c} index={i} onOpen={onOpen} />)}
      </div>
    </div>
  );
}
