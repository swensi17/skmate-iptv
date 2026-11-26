import { useEffect, useMemo, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { focusFirst, VirtualList } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import { kindOf, SPORT_LABEL, sportSummary, type SportKind } from "../sport";
import { useContext } from "preact/hooks";
import { UiContext } from "../state/UiContext";
import { ChannelSearch } from "../state/channelSearch";
import { GuideContext } from "../state/GuideContext";
import { ChannelRow } from "./ChannelRow";
import { SearchEntry } from "./EntryRow";
import "./screens.css";

/** The room under the title row and the filters; the list shows only whole rows of it, so the last one is never cut. */
const ROOM = 816;
const TYPING_PAUSE_MS = 180;

interface Props {
  channels: Channel[];
  favorites: ReadonlySet<string>;
  onOpen: (c: Channel, list: readonly Channel[]) => void;
  onFav: (c: Channel) => void;
}

/** Sport from the channel names: filters by kind of sport on top, a search of its own, the list below. */
export function SportView({ channels, favorites, onOpen, onFav }: Props) {
  const ROW = useContext(UiContext).rowH;
  const height = Math.max(ROW, Math.floor(ROOM / ROW) * ROW);
  const { list, kinds } = useMemo(() => sportSummary(channels), [channels]);
  const [kind, setKind] = useState<SportKind | "all">("all");
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  const byKind = useMemo(() => (kind === "all" ? list : list.filter((c) => kindOf(c) === kind)), [list, kind]);
  const guide = useContext(GuideContext);
  const index = useMemo(() => new ChannelSearch(byKind, guide.data, guide.now), [byKind, guide.data, Math.floor(guide.now / 60_000)]);
  const shown = useMemo(() => (settled.trim() === "" ? byKind : index.search(settled)), [byKind, index, settled]);
  useEffect(() => { focusFirst(document, "sport-all"); }, []);
  useEffect(() => { const id = setTimeout(() => setSettled(query), TYPING_PAUSE_MS); return () => clearTimeout(id); }, [query]);

  return (
    <div class="screen sport">
      {/* As on the channels screen: the title, then the search box on the left. */}
      <div class="screen-top">
        <h2>{t("navSport")}</h2>
        <SearchEntry id="sport-search" value={query} entryTitle={`${t("filterSearch")}: ${t("navSport")}`} entryHint={t("searchChannelsHint")}
          count={(q) => index.search(q).length} results=".screen.sport .vlist"
          onDone={(v) => { setQuery(v); setSettled(v); }} />
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
        <div class="empty-idle state">
          <div class="empty-title">{list.length === 0 ? t("sportEmpty") : t("searchNothing", { q: settled.trim() })}</div>
        </div>
      ) : (
        <VirtualList
          key={`${kind}|${settled}`} items={shown} rowHeight={ROW} height={height} pageSize={9}
          idOf={(c) => `ch-${c.id}`}
          renderRow={(c, i) => <ChannelRow channel={c} index={i} favorite={favorites.has(channelKey(c))} onOpen={(ch) => onOpen(ch, shown)} onFav={onFav} />}
        />
      )}
    </div>
  );
}
