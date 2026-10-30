import { useEffect, useMemo, useState } from "preact/hooks";
import { groupsOf, type Channel } from "@skmate/core";
import { focusFirst } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import type { Status } from "../state/usePlaylists";
import { ChannelRow } from "./ChannelRow";

const FAV = "\u0000fav";

interface Props {
  channels: Channel[];
  favorites: ReadonlySet<string>;
  status: Status;
  onOpen: (c: Channel) => void;
  onFav: (c: Channel) => void;
  onAddPlaylist: () => void;
  onDemo: () => void;
}

export function LiveView(p: Props) {
  const groups = useMemo(() => groupsOf(p.channels), [p.channels]);
  const favs = useMemo(() => p.channels.filter((c) => p.favorites.has(channelKey(c))), [p.channels, p.favorites]);
  const [group, setGroup] = useState<string | null>(null);
  const shown = group === FAV ? favs : group === null ? p.channels : groups.find((g) => g.name === group)?.channels ?? [];
  useEffect(() => { focusFirst(document, shown[0] ? `ch-${shown[0].id}` : "empty-add"); }, [group, p.channels.length === 0]);
  useEffect(() => { if (group === FAV && favs.length === 0) setGroup(null); }, [favs.length]);

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
        <button class="row" data-focus="g-all" onClick={() => setGroup(null)} aria-pressed={group === null}>
          <span class="grow">{t("allChannels")}</span>
          <span class="sub">{p.channels.length}</span>
        </button>
        {favs.length > 0 ? (
          <button class="row" data-focus="g-fav" onClick={() => setGroup(FAV)} aria-pressed={group === FAV}>
            <span class="grow">{t("favorites")}</span>
            <span class="sub">{favs.length}</span>
          </button>
        ) : null}
        {groups.map((g, i) => (
          <button class="row" key={g.name} data-focus={`g-${i}`} onClick={() => setGroup(g.name)} aria-pressed={group === g.name}>
            <span class="grow">{g.name}</span>
            <span class="sub">{g.channels.length}</span>
          </button>
        ))}
      </aside>
      <section class="list">
        <div class="list-head">{t("channelsCount", { n: shown.length })} · {t("favHint")}</div>
        <div class="scroll">
          {shown.map((c, i) => (
            <ChannelRow key={c.id} channel={c} index={i} favorite={p.favorites.has(channelKey(c))} onOpen={p.onOpen} onFav={p.onFav} />
          ))}
        </div>
      </section>
    </div>
  );
}
