import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { groupsOf, SearchIndex, type Channel } from "@skmate/core";
import { focusFirst, Icon, VirtualList } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import type { Settings } from "../state/settings";
import type { Status } from "../state/usePlaylists";
import { capitalize } from "../text";
import { ChannelRow } from "./ChannelRow";
import { PreviewPane } from "./PreviewPane";

const FAV = "\u0000fav";
const ALL = "\u0000all";
const ROW = 84;
const LIST_HEIGHT = 840;
const DWELL_MS = 600;
const TYPING_PAUSE_MS = 180;

type Sort = "provider" | "az" | "za";
const NEXT_SORT: Record<Sort, Sort> = { provider: "az", az: "za", za: "provider" };

interface GroupItem { key: string; label: string; count: number }

interface Props {
  channels: Channel[];
  favorites: ReadonlySet<string>;
  status: Status;
  settings: Settings;
  onOpen: (c: Channel, list: readonly Channel[]) => void;
  onFav: (c: Channel) => void;
  onAddPlaylist: () => void;
  onDemo: () => void;
}

export function LiveView(p: Props) {
  const groups = useMemo(() => groupsOf(p.channels), [p.channels]);
  const favs = useMemo(() => p.channels.filter((c) => p.favorites.has(channelKey(c))), [p.channels, p.favorites]);
  const [group, setGroup] = useState<string>(ALL);
  const [sort, setSort] = useState<Sort>("provider");
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  const [focused, setFocused] = useState<Channel | null>(null);
  const [dwelled, setDwelled] = useState<Channel | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const base = group === FAV ? favs : group === ALL ? p.channels : groups.find((g) => g.name === group)?.channels ?? [];
  const index = useMemo(() => new SearchIndex(base, (c) => c.name), [base]);
  const found = useMemo(() => (settled.trim() === "" ? base : index.search(settled).map((r) => r.item)), [base, index, settled]);
  const shown = useMemo(() => {
    if (sort === "provider" || settled.trim() !== "") return found;
    const copy = [...found].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return sort === "az" ? copy : copy.reverse();
  }, [found, sort, settled]);

  const groupItems = useMemo<GroupItem[]>(() => [
    { key: ALL, label: t("allChannels"), count: p.channels.length },
    ...(favs.length > 0 ? [{ key: FAV, label: t("favorites"), count: favs.length }] : []),
    ...groups.map((g) => ({ key: g.name, label: capitalize(g.name), count: g.channels.length })),
  ], [p.channels, favs.length, groups]);

  useEffect(() => { focusFirst(document, shown[0] ? `ch-${shown[0].id}` : "empty-add"); }, [group, p.channels.length === 0]);
  useEffect(() => { if (group === FAV && favs.length === 0) setGroup(ALL); }, [favs.length]);
  useEffect(() => { const id = setTimeout(() => setSettled(query), TYPING_PAUSE_MS); return () => clearTimeout(id); }, [query]);
  useEffect(() => () => clearTimeout(timer.current), []);

  // The preview follows the cursor only after it has rested on a channel: listing fast must not open a stream per row.
  const onFocusChannel = (c: Channel) => {
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
      <div class="live-top">
        <h2>{t("navLive")}</h2>
        <div class="toolbar">
          <input class="field small" data-focus="live-search" value={query} placeholder={t("filterSearch")}
            onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
          <button class="btn tool" data-focus="live-sort" onClick={() => setSort(NEXT_SORT[sort])}>
            <Icon name="sort" size={28} /> {t(sort === "provider" ? "sortProvider" : sort === "az" ? "sortAz" : "sortZa")}
          </button>
        </div>
      </div>
      <div class="live-main">
        <aside class="groups">
          <VirtualList
            items={groupItems} rowHeight={ROW} height={LIST_HEIGHT}
            idOf={(g) => `g:${g.key}`}
            renderRow={(g) => (
              <button class="row" data-focus={`g:${g.key}`} onClick={() => setGroup(g.key)} aria-pressed={group === g.key}>
                <span class="grow">{g.label}</span>
                <span class="sub">{g.count}</span>
              </button>
            )}
          />
        </aside>
        <section class="list">
          <div class="list-head">{t("channelsCount", { n: shown.length })}</div>
          <VirtualList
            key={`${group}|${settled}|${sort}`}
            items={shown} rowHeight={ROW} height={LIST_HEIGHT - 56} pageSize={9}
            idOf={(c) => `ch-${c.id}`}
            renderRow={(c, i) => (
              <ChannelRow channel={c} index={i} favorite={p.favorites.has(channelKey(c))}
                onOpen={(ch) => p.onOpen(ch, shown)} onFav={p.onFav} onFocus={onFocusChannel} />
            )}
          />
        </section>
        <PreviewPane channel={dwelled} focused={focused} settings={p.settings} />
      </div>
    </div>
  );
}
