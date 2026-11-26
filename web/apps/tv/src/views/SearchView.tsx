import { useContext, useEffect, useMemo, useState } from "preact/hooks";
import { SearchIndex, type Channel } from "@skmate/core";
import type { Programme } from "@skmate/epg";
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
import { SearchEntry } from "./EntryRow";

type Filter = "all" | "channels" | "shows" | "sport" | "movies";
const FILTERS: Array<[Filter, Key]> = [
  ["all", "sfAll"], ["channels", "sfChannels"], ["shows", "sfShows"], ["sport", "sfSport"], ["movies", "sfMovies"],
];

type Hit = { k: "c"; channel: Channel } | { k: "p"; channel: Channel; programme: ProgrammeHit["programme"] };

interface Props {
  channels: Channel[];
  favorites: ReadonlySet<string>;
  onOpen: (c: Channel, list: readonly Channel[]) => void;
  /** A found programme that is over: its recording. */
  onArchive: (c: Channel, p: Programme, list: readonly Channel[]) => void;
  /** A found programme still to come: watch the channel or be reminded. */
  onUpcoming: (c: Channel, p: Programme, list: readonly Channel[]) => void;
  reminded: (c: Channel, p: Programme) => boolean;
  onFav: (c: Channel) => void;
}

/** A TV is slow: the search waits for a short pause in typing instead of running on every key. */
const TYPING_PAUSE_MS = 180;
/** How long a query that found something must stay before it joins the recent ones. */
const REMEMBER_AFTER_MS = 2500;
const HEIGHT = 700;

/**
 * Search as in the phone version: channels and the guide's programmes together, filters (all, channels, programmes,
 * sport, films), the recent queries, and a plain "nothing found" that says what is searched.
 */
export function SearchView({ channels, favorites, onOpen, onArchive, onUpcoming, reminded, onFav }: Props) {
  const ROW = useContext(UiContext).rowH;
  const { data, now } = useContext(GuideContext);
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [recent, setRecent] = useState<string[]>(loadQueries);

  const channelIndex = useMemo(() => new SearchIndex(channels, (c) => c.name), [channels]);
  const programmes = useMemo(() => new ProgrammeSearch(data, channels, now), [data, channels, Math.floor(now / 60_000)]);

  const q = settled.trim();
  // What a query finds under the chosen filter: for the results, and for the count while it is being typed.
  const find = (query: string) => {
    if (query === "") return { channelHits: [] as Channel[], programmeHits: [] as ProgrammeHit[] };
    let c = filter === "shows" ? [] : channelIndex.search(query).map((r) => r.item);
    let p = filter === "channels" ? [] : programmes.search(query, now);
    if (filter === "sport") { c = c.filter(isSport); p = p.filter((h) => isSport(h.channel)); }
    if (filter === "movies") { c = c.filter(isMovieChannel); p = p.filter((h) => isMovieTitle(h.programme.title) || isMovieChannel(h.channel)); }
    return { channelHits: c, programmeHits: p };
  };
  const { channelHits, programmeHits } = useMemo(() => find(q), [q, filter, channelIndex, programmes, now]);
  const countOf = (query: string) => { const f = find(query); return f.channelHits.length + f.programmeHits.length; };

  const hits = useMemo<Hit[]>(() => {
    const showC = filter !== "shows";
    const showP = filter !== "channels";
    return [
      ...(showC ? channelHits.map((channel): Hit => ({ k: "c", channel })) : []),
      ...(showP ? programmeHits.map((h): Hit => ({ k: "p", channel: h.channel, programme: h.programme })) : []),
    ];
  }, [channelHits, programmeHits, filter]);
  const playable = useMemo(() => hits.map((h) => h.channel).filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i), [hits]);

  // The search box first: it is a button (OK opens the entry panel), so no TV keyboard pops up by itself.
  useEffect(() => { focusFirst(document, "search-input"); }, []);
  useEffect(() => { const id = setTimeout(() => setSettled(query), TYPING_PAUSE_MS); return () => clearTimeout(id); }, [query]);

  const remember = () => { const next = pushQuery(recent, q); setRecent(next); saveQueries(next); };
  // A query that found something is remembered once the viewer stops typing for a while, not only when a result is
  // opened: "Lord of the Rings" looked up and left should still be there next time.
  useEffect(() => {
    if (q.length < 2 || hits.length === 0) return;
    const id = setTimeout(remember, REMEMBER_AFTER_MS);
    return () => clearTimeout(id);
  }, [q, hits.length > 0]);
  const open = (c: Channel) => { remember(); onOpen(c, playable); };
  // A programme that has ended plays from its recording (only those the channel keeps are found at all).
  const openProgramme = (c: Channel, p: Programme) => {
    remember();
    const now = Date.now();
    if (p.stop <= now) onArchive(c, p, playable);
    else if (p.start > now) onUpcoming(c, p, playable);
    else onOpen(c, playable);
  };

  return (
    <div class="screen search">
      {/* The same search box as on the other screens, only larger: top left, the filters under it, the results below. */}
      <SearchEntry id="search-input" wide value={query} placeholder={t("searchPlaceholder2")}
        entryTitle={t("navSearch")} entryHint={t("searchCaption")} count={countOf} results=".screen.search .vlist"
        onDone={(v) => { setQuery(v); setSettled(v); }} />
      <div class="filters">
        {FILTERS.map(([id, label]) => (
          <button class="filter" key={id} data-focus={`sf-${id}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{t(label)}</button>
        ))}
      </div>

      {q === "" ? (
        // Before anything is searched: the last queries first (OK on one repeats it), then what can be found.
        <div class="search-idle start">
          {recent.length > 0 ? (
            <div class="search-recent">
              <div class="caption">{t("searchRecent")}</div>
              <div class="recent">
                {recent.map((r) => (
                  <button class="filter" key={r} data-focus={`rq-${r}`} onClick={() => { setQuery(r); setSettled(r); }}>
                    <Icon name="history" size={22} />{r}
                  </button>
                ))}
                <button class="filter quiet" data-focus="rq-clear" onClick={() => { setRecent([]); saveQueries([]); focusFirst(document, "search-input"); }}>
                  {t("searchClear")}
                </button>
              </div>
            </div>
          ) : null}
          <div class="search-tip">
            <div class="search-tip-title">{t("searchIdleTitle")}</div>
            <div class="search-tip-body">{t("searchCaption")}</div>
          </div>
        </div>
      ) : hits.length === 0 ? (
        <div class="empty-idle">
          <div class="empty-title">{t("searchNothing", { q })}</div>
          <div class="empty-hint" style={{ maxWidth: 900 }}>{t("searchNothingBody")}</div>
        </div>
      ) : (
        <>
          <div class="list-head">{t("searchCount", { c: channelHits.length, p: programmeHits.length })}</div>
          <VirtualList
            key={`${q}|${filter}|${ROW}`}
            items={hits} rowHeight={ROW} height={Math.floor(HEIGHT / ROW) * ROW} pageSize={8}
            idOf={(h, i) => (h.k === "c" ? `ch-${h.channel.id}` : `pr-${h.channel.id}-${h.programme.start}-${i}`)}
            renderRow={(h, i) => h.k === "c"
              ? <ChannelRow channel={h.channel} index={i} favorite={favorites.has(channelKey(h.channel))} onOpen={open} onFav={onFav} />
              : <ProgrammeRow channel={h.channel} programme={h.programme} reminded={reminded(h.channel, h.programme)} onOpen={openProgramme} />}
          />
        </>
      )}
    </div>
  );
}
