import { useEffect, useMemo, useState } from "preact/hooks";
import { groupsOf, type Channel } from "@skmate/core";
import { focusFirst, VirtualList } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import { capitalize } from "../text";
import type { Status } from "../state/usePlaylists";
import { ChannelRow } from "./ChannelRow";

const FAV = "\u0000fav";
const ALL = "\u0000all";
const ROW = 84;
const LIST_HEIGHT = 924;
const GROUPS_HEIGHT = 900;

interface GroupItem { key: string; label: string; count: number }

interface Props {
  channels: Channel[];
  favorites: ReadonlySet<string>;
  status: Status;
  onOpen: (c: Channel, list: readonly Channel[]) => void;
  onFav: (c: Channel) => void;
  onAddPlaylist: () => void;
  onDemo: () => void;
}

export function LiveView(p: Props) {
  const groups = useMemo(() => groupsOf(p.channels), [p.channels]);
  const favs = useMemo(() => p.channels.filter((c) => p.favorites.has(channelKey(c))), [p.channels, p.favorites]);
  const [group, setGroup] = useState<string>(ALL);
  const shown = group === FAV ? favs : group === ALL ? p.channels : groups.find((g) => g.name === group)?.channels ?? [];

  const groupItems = useMemo<GroupItem[]>(() => [
    { key: ALL, label: t("allChannels"), count: p.channels.length },
    ...(favs.length > 0 ? [{ key: FAV, label: t("favorites"), count: favs.length }] : []),
    ...groups.map((g) => ({ key: g.name, label: capitalize(g.name), count: g.channels.length })),
  ], [p.channels, favs.length, groups]);

  useEffect(() => { focusFirst(document, shown[0] ? `ch-${shown[0].id}` : "empty-add"); }, [group, p.channels.length === 0]);
  useEffect(() => { if (group === FAV && favs.length === 0) setGroup(ALL); }, [favs.length]);

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
      <aside class="groups">
        <h2>{t("navLive")}</h2>
        <VirtualList
          items={groupItems} rowHeight={ROW} height={GROUPS_HEIGHT}
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
        <div class="list-head">{t("channelsCount", { n: shown.length })} · {t("favHint")}</div>
        <VirtualList
          key={group}
          items={shown} rowHeight={ROW} height={LIST_HEIGHT} pageSize={10}
          idOf={(c) => `ch-${c.id}`}
          renderRow={(c, i) => (
            <ChannelRow channel={c} index={i} favorite={p.favorites.has(channelKey(c))} onOpen={(ch) => p.onOpen(ch, shown)} onFav={p.onFav} />
          )}
        />
      </section>
    </div>
  );
}
