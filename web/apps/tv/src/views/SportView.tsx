import { useEffect, useMemo, useState } from "preact/hooks";
import { SearchIndex, type Channel } from "@skmate/core";
import { focusFirst, VirtualList } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import { kindOf, SPORT_LABEL, sportSummary, type SportKind } from "../sport";
import { ChannelRow } from "./ChannelRow";

const ROW = 84;
const HEIGHT = 780;
const TYPING_PAUSE_MS = 180;

interface Props {
  channels: Channel[];
  favorites: ReadonlySet<string>;
  onOpen: (c: Channel, list: readonly Channel[]) => void;
  onFav: (c: Channel) => void;
}

/** Sport from the channel names: filters by kind of sport on top, a search of its own, the list below. */
export function SportView({ channels, favorites, onOpen, onFav }: Props) {
  const { list, kinds } = useMemo(() => sportSummary(channels), [channels]);
  const [kind, setKind] = useState<SportKind | "all">("all");
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  const byKind = useMemo(() => (kind === "all" ? list : list.filter((c) => kindOf(c) === kind)), [list, kind]);
  const index = useMemo(() => new SearchIndex(byKind, (c) => c.name), [byKind]);
  const shown = useMemo(() => (settled.trim() === "" ? byKind : index.search(settled).map((r) => r.item)), [byKind, index, settled]);
  useEffect(() => { focusFirst(document, "sport-all"); }, []);
  useEffect(() => { const id = setTimeout(() => setSettled(query), TYPING_PAUSE_MS); return () => clearTimeout(id); }, [query]);

  return (
    <div class="screen sport">
      <h2>{t("navSport")}</h2>
      <div class="toolbar">
        <input class="field small" data-focus="sport-search" value={query} placeholder={t("filterSearch")}
          onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
      </div>
      <div class="filters">
        <button class="filter" data-focus="sport-all" aria-pressed={kind === "all"} onClick={() => setKind("all")}>
          {t("sportAll")} <span class="count">{list.length}</span>
        </button>
        {kinds.map(([k, n]) => (
          <button class="filter" key={k} data-focus={`sport-${k}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t(SPORT_LABEL[k])} <span class="count">{n}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div class="list-head">{t("sportEmpty")}</div>
      ) : (
        <VirtualList
          key={`${kind}|${settled}`} items={shown} rowHeight={ROW} height={HEIGHT} pageSize={9}
          idOf={(c) => `ch-${c.id}`}
          renderRow={(c, i) => <ChannelRow channel={c} index={i} favorite={favorites.has(channelKey(c))} onOpen={(ch) => onOpen(ch, shown)} onFav={onFav} />}
        />
      )}
    </div>
  );
}
