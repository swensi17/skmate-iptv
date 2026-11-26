import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { groupsOf, type Channel } from "@skmate/core";
import { focusFirst, Icon, isBack, Presence, VirtualList } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import type { Settings } from "../state/settings";
import type { Status } from "../state/usePlaylists";
import { capitalize } from "../text";
import { ChannelSearch } from "../state/channelSearch";
import { interestRank } from "../state/interests";
import { GuideContext } from "../state/GuideContext";
import { GroupIcon } from "./GroupIcon";
import { ChannelRow } from "./ChannelRow";
import { UiContext } from "../state/UiContext";
import { PreviewPane } from "./PreviewPane";
import { SearchEntry } from "./EntryRow";

// Keys of the built-in groups; a leading "~" keeps them apart from any group a provider names.
const FAV = "~fav";
const ALL = "~all";
const RECENT = "~recent";
const ARCHIVE = "~archive";
const LIST_HEIGHT = 840;
/** A category is a plain line of text, closer together than a channel. */
const GROUP_ROW = 64;
const DWELL_MS = 600;
const TYPING_PAUSE_MS = 180;

type Sort = "provider" | "az" | "za";
const SORTS: Sort[] = ["provider", "az", "za"];
/** The sort row under the categories, and the space above it. */
const SORT_ROW = GROUP_ROW + 8;

interface GroupItem { key: string; label: string; count: number }

/**
 * The channel screen goes away while a channel plays full screen. What the viewer had chosen (the category, the sort,
 * the filter and the channel the cursor was on) waits here, so Back from the player lands on that same row instead of
 * the top of "All channels". A profile switch reloads the page, which starts this afresh.
 */
const memory: { group: string; sort: Sort; query: string; channel: string | null } = { group: ALL, sort: "provider", query: "", channel: null };

interface Props {
  channels: Channel[];
  favorites: ReadonlySet<string>;
  status: Status;
  settings: Settings;
  onOpen: (c: Channel, list: readonly Channel[]) => void;
  onFav: (c: Channel) => void;
  onAddPlaylist: () => void;
  onDemo: () => void;
  greeting: string;
  playlistName: string | null;
  onPickPlaylist: () => void;
  recents: Channel[];
  /** A stream is playing full screen: the preview must not compete with it. */
  paused: boolean;
}

export function LiveView(p: Props) {
  const ROW = useContext(UiContext).rowH;
  const groups = useMemo(() => groupsOf(p.channels), [p.channels]);
  const favs = useMemo(() => p.channels.filter((c) => p.favorites.has(channelKey(c))), [p.channels, p.favorites]);
  const [group, setGroupState] = useState<string>(memory.group);
  const [sort, setSortState] = useState<Sort>(memory.sort);
  const [query, setQueryState] = useState(memory.query);
  const [settled, setSettled] = useState(memory.query);
  const setGroup = (g: string) => { memory.group = g; memory.channel = null; setGroupState(g); };
  const setSort = (v: Sort) => { memory.sort = v; memory.channel = null; setSortState(v); };
  const setQuery = (q: string) => { memory.query = q; memory.channel = null; setQueryState(q); };
  // The categories are out of the way while you browse the channels: Left brings them in, Right sends them off.
  const [catsOpen, setCatsOpen] = useState(false);
  const [focused, setFocused] = useState<Channel | null>(null);
  const [dwelled, setDwelled] = useState<Channel | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const archive = useMemo(() => p.channels.filter((c) => (c.catchupDays ?? 0) > 0), [p.channels]);
  const base = group === FAV ? favs : group === RECENT ? p.recents : group === ARCHIVE ? archive : group === ALL ? p.channels : groups.find((g) => g.name === group)?.channels ?? [];
  const guide = useContext(GuideContext);
  const index = useMemo(() => new ChannelSearch(base, guide.data, guide.now), [base, guide.data, Math.floor(guide.now / 60_000)]);
  const found = useMemo(() => (settled.trim() === "" ? base : index.search(settled)), [base, index, settled]);
  const shown = useMemo(() => {
    if (sort === "provider" || settled.trim() !== "") return found;
    const copy = [...found].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return sort === "az" ? copy : copy.reverse();
  }, [found, sort, settled]);

  const groupItems = useMemo<GroupItem[]>(() => [
    { key: ALL, label: t("allChannels"), count: p.channels.length },
    ...(favs.length > 0 ? [{ key: FAV, label: t("favorites"), count: favs.length }] : []),
    ...(p.recents.length > 0 ? [{ key: RECENT, label: t("groupRecent"), count: p.recents.length }] : []),
    ...(archive.length > 0 ? [{ key: ARCHIVE, label: t("groupArchive"), count: archive.length }] : []),
    ...groups.map((g) => ({ key: g.name, label: capitalize(g.name), count: g.channels.length }))
      .map((g, i) => ({ g, i })).sort((a, b) => interestRank(a.g.label, p.settings.interests) - interestRank(b.g.label, p.settings.interests) || a.i - b.i).map((x) => x.g),
  ], [p.channels, favs.length, p.recents.length, archive.length, groups, p.settings.interests]);

  // The row the cursor was on before a channel was opened, while it is still in the list; else the first.
  const back = memory.channel !== null ? shown.findIndex((c) => c.id === memory.channel) : -1;
  useEffect(() => {
    const id = back >= 0 ? memory.channel : shown[0]?.id;
    focusFirst(document, id ? `ch-${id}` : "empty-add");
  }, [group, p.channels.length === 0]);
  useEffect(() => { if (group === FAV && favs.length === 0) setGroup(ALL); }, [favs.length]);
  useEffect(() => { const id = setTimeout(() => setSettled(query), TYPING_PAUSE_MS); return () => clearTimeout(id); }, [query]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!catsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isBack(e)) return;
      e.stopPropagation();
      e.preventDefault();
      setCatsOpen(false);
      focusList();
    };
    document.addEventListener("keydown", onKey, true); // before the app's own Back
    return () => document.removeEventListener("keydown", onKey, true);
  }, [catsOpen, shown]);
  /** Back to the channels: the row the cursor was on (it is still drawn), else the first. */
  const focusList = () => { const c = shown.find((x) => x.id === memory.channel) ?? shown[0]; focusFirst(document, c ? `ch-${c.id}` : undefined); };
  const openCats = () => {
    setCatsOpen(true);
    setTimeout(() => focusFirst(document, `g:${group}`), 60); // once the column has come in
  };
  const closeCats = () => {
    setCatsOpen(false);
    focusList();
  };

  // The preview follows the cursor only after it has rested on a channel: listing fast must not open a stream per row.
  const onFocusChannel = (c: Channel) => {
    memory.channel = c.id;
    setFocused(c);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDwelled(c), DWELL_MS);
  };

  if (p.channels.length === 0) {
    return (
      <div class="screen empty">
        {p.status.kind === "loading" ? <div class="empty-title">{t("playlistLoading")}</div> : (
          <>
            <div class="empty-title">{t("emptyTitle")}</div>
            <div class="empty-hint">{p.status.kind === "error" ? p.status.message : t("emptyHint")}</div>
            <div class="empty-actions">
              <button class="btn" data-focus="empty-add" onClick={p.onAddPlaylist}>{t("emptyAdd")}</button>
              <button class="btn" data-focus="empty-demo" onClick={p.onDemo}>{t("emptyDemo")}</button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div class="screen live">
      {/* The same toolbar on every screen: the title, then the search box on the left; the playlist on the right.
          The sort is one row under the categories (Left), with what it is set to. */}
      <div class="live-top">
        <div class="top-title"><h2>{t("navLive")}</h2></div>
        <SearchEntry id="live-search" value={query} entryTitle={`${t("filterSearch")}: ${t("navLive")}`} entryHint={t("searchChannelsHint")}
          count={(q) => index.search(q).length} results=".screen.live .list .vlist"
          onDone={(v) => { setQuery(v); setSettled(v); }} />
        <div class="toolbar">
          <button class="btn tool" data-focus="live-playlist" onClick={p.onPickPlaylist}>
            <Icon name="playlist" size={28} /> <span class="chip-name">{p.playlistName ?? t("noPlaylist")}</span>
          </button>
        </div>
      </div>
      <div class="live-main">
        <Presence show={catsOpen} ms={170}>
          {(out) => (
            <aside class={`groups${out ? " out" : ""}`} onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.keyCode === 39) { e.stopPropagation(); e.preventDefault(); closeCats(); }
            }}>
              <div class="gr-head"><span class="grow">{p.playlistName ?? t("noPlaylist")}</span></div>
              <VirtualList
                items={groupItems} rowHeight={GROUP_ROW} height={LIST_HEIGHT - 72 - SORT_ROW}
                idOf={(g) => `g:${g.key}`}
                renderRow={(g) => (
                  <button class="row gr" data-focus={`g:${g.key}`} onClick={() => { if (g.key === group) closeCats(); else { setGroup(g.key); setCatsOpen(false); } }} aria-pressed={group === g.key}>
                    <GroupIcon id={g.key} />
                    <span class="grow">{g.label}</span>
                    <span class="sub">{g.count}</span>
                  </button>
                )}
              />
              {/* OK steps through the orders; the row says the one in use. */}
              <button class="row gr gr-sort" data-focus="live-sort" onClick={() => setSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length] ?? "provider")}>
                <span class="grow">{t("sortLabel", { v: t(sort === "provider" ? "sortProvider" : sort === "az" ? "sortAz" : "sortZa") })}</span>
              </button>
            </aside>
          )}
        </Presence>
        <section class="list" onKeyDown={(e) => {
          if ((e.key === "ArrowLeft" || e.keyCode === 37) && !catsOpen && !(e.target instanceof HTMLInputElement)) { e.stopPropagation(); e.preventDefault(); openCats(); }
        }}>
          <div class="list-head">{t("channelsN", { n: shown.length })}{group === ARCHIVE ? ` · ${t("archiveHint")}` : ""}</div>
          <VirtualList
            key={`${group}|${settled}|${sort}|${ROW}`}
            items={shown} rowHeight={ROW} height={Math.floor((LIST_HEIGHT - 56) / ROW) * ROW} pageSize={9} initialIndex={Math.max(0, back)}
            idOf={(c) => `ch-${c.id}`}
            renderRow={(c, i) => (
              <ChannelRow channel={c} index={i} favorite={p.favorites.has(channelKey(c))}
                onOpen={(ch) => p.onOpen(ch, shown)} onFav={p.onFav} onFocus={onFocusChannel} />
            )}
          />
        </section>
        <PreviewPane channel={p.paused ? null : dwelled} focused={focused} settings={p.settings} />
      </div>
    </div>
  );
}
