import { useContext, useEffect, useMemo, useState } from "preact/hooks";
import { SearchIndex, type Channel } from "@skmate/core";
import { focusFirst, Icon, VirtualList } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { channelKey } from "../state/favorites";
import { GuideContext } from "../state/GuideContext";
import { isMovieChannel, isMovieTitle } from "../state/kinds";
import { ProgrammeSearch, type ProgrammeHit } from "../state/programmeSearch";
import { loadQueries, pushQuery, saveQueries } from "../state/recentQueries";
import { UiContext } from "../state/UiContext";
import { isSport } from "../sport";
import { ChannelRow } from "./ChannelRow";
import { ProgrammeRow } from "./ProgrammeRow";

type Filter = "all" | "channels" | "shows" | "sport" | "movies";
const FILTERS: Array<[Filter, Key]> = [
  ["all", "sfAll"], ["channels", "sfChannels"], ["shows", "sfShows"], ["sport", "sfSport"], ["movies", "sfMovies"],
];

type Hit = { k: "c"; channel: Channel } | { k: "p"; channel: Channel; programme: ProgrammeHit["programme"] };

interface Props {
  channels: Channel[];
  favorites: ReadonlySet<string>;
  onOpen: (c: Channel, list: readonly Channel[]) => void;
  onFav: (c: Channel) => void;
}

/** A TV is slow: the search waits for a short pause in typing instead of running on every key. */
const TYPING_PAUSE_MS = 180;
const HEIGHT = 700;

/**
 * Search as in the phone version: channels and the guide's programmes together, filters (all, channels, programmes,
 * sport, films), the recent queries, and a plain "nothing found" that says what is searched.
 */
export function SearchView({ channels, favorites, onOpen, onFav }: Props) {
  const ROW = useContext(UiContext).rowH;
  const { data, now } = useContext(GuideContext);
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [recent, setRecent] = useState<string[]>(loadQueries);

  const channelIndex = useMemo(() => new SearchIndex(channels, (c) => c.name), [channels]);
  const programmes = useMemo(() => new ProgrammeSearch(data, channels, now), [data, channels, Math.floor(now / 60_000)]);

  const q = settled.trim();
  const { channelHits, programmeHits } = useMemo(() => {
    if (q === "") return { channelHits: [] as Channel[], programmeHits: [] as ProgrammeHit[] };
    let c = channelIndex.search(q).map((r) => r.item);
    let p = programmes.search(q, now);
    if (filter === "sport") { c = c.filter(isSport); p = p.filter((h) => isSport(h.channel)); }
    if (filter === "movies") { c = c.filter(isMovieChannel); p = p.filter((h) => isMovieTitle(h.programme.title) || isMovieChannel(h.channel)); }
    return { channelHits: c, programmeHits: p };
  }, [q, filter, channelIndex, programmes, now]);

  const hits = useMemo<Hit[]>(() => {
    const showC = filter !== "shows";
    const showP = filter !== "channels";
    return [
      ...(showC ? channelHits.map((channel): Hit => ({ k: "c", channel })) : []),
      ...(showP ? programmeHits.map((h): Hit => ({ k: "p", channel: h.channel, programme: h.programme })) : []),
    ];
  }, [channelHits, programmeHits, filter]);
  const playable = useMemo(() => hits.map((h) => h.channel).filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i), [hits]);

  useEffect(() => { focusFirst(document, "search-input"); }, []);
  useEffect(() => { const id = setTimeout(() => setSettled(query), TYPING_PAUSE_MS); return () => clearTimeout(id); }, [query]);

  const remember = () => { const next = pushQuery(recent, q); setRecent(next); saveQueries(next); };
  const open = (c: Channel) => { remember(); onOpen(c, playable); };

  return (
    <div class="screen search">
      <div class="search-bar">
        <Icon name="search" size={32} />
        <input
          class="field" data-focus="search-input" value={query} placeholder={t("searchPlaceholder2")}
          onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
        />
      </div>
      <div class="filters">
        {FILTERS.map(([id, label]) => (
          <button class="filter" key={id} data-focus={`sf-${id}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{t(label)}</button>
        ))}
      </div>

      {q === "" ? (
        <div class="search-idle">
          {recent.length > 0 ? (
            <>
              <div class="caption">{t("searchRecent")}</div>
              <div class="recent">
                {recent.map((r) => (
                  <button class="filter" key={r} data-focus={`rq-${r}`} onClick={() => { setQuery(r); setSettled(r); }}>{r}</button>
                ))}
                <button class="filter" data-focus="rq-clear" onClick={() => { setRecent([]); saveQueries([]); }}>{t("searchClear")}</button>
              </div>
            </>
          ) : (
            <div class="empty-idle">
              <div class="empty-title">{t("searchIdleTitle")}</div>
              <div class="empty-hint">{t("searchIdleBody")}</div>
            </div>
          )}
          <div class="srow-hint" style={{ margin: "24px 12px" }}>{t("searchCaption")}</div>
        </div>
      ) : hits.length === 0 ? (
        <div class="empty-idle">
          <div class="empty-title">{t("searchNothing", { q })}</div>
          <div class="empty-hint" style={{ maxWidth: 900 }}>{t("searchNothingBody")}</div>
        </div>
      ) : (
        <>
          <div class="list-head">{t("searchCount", { c: filter === "shows" ? 0 : channelHits.length, p: filter === "channels" ? 0 : programmeHits.length })}</div>
          <VirtualList
            key={`${q}|${filter}|${ROW}`}
            items={hits} rowHeight={ROW} height={HEIGHT} pageSize={8}
            idOf={(h, i) => (h.k === "c" ? `ch-${h.channel.id}` : `pr-${h.channel.id}-${h.programme.start}-${i}`)}
            renderRow={(h, i) => h.k === "c"
              ? <ChannelRow channel={h.channel} index={i} favorite={favorites.has(channelKey(h.channel))} onOpen={open} onFav={onFav} />
              : <ProgrammeRow channel={h.channel} programme={h.programme} onOpen={open} />}
          />
        </>
      )}
    </div>
  );
}
