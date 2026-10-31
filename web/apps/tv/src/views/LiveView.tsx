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
import { ChannelRow } from "./ChannelRow";
import { UiContext } from "../state/UiContext";
import { PreviewPane } from "./PreviewPane";

// Keys of the built-in groups; a leading "~" keeps them apart from any group a provider names.
const FAV = "~fav";
const ALL = "~all";
const RECENT = "~recent";
const ARCHIVE = "~archive";
const LIST_HEIGHT = 840;
const DWELL_MS = 600;
const TYPING_PAUSE_MS = 180;

type Sort = "provider" | "az" | "za";

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
  const [group, setGroup] = useState<string>(ALL);
  const [sort, setSort] = useState<Sort>("provider");
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
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

  useEffect(() => { focusFirst(document, shown[0] ? `ch-${shown[0].id}` : "empty-add"); }, [group, p.channels.length === 0]);
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
      focusFirst(document, shown[0] ? `ch-${shown[0].id}` : undefined);
    };
    document.addEventListener("keydown", onKey, true); // before the app's own Back
    return () => document.removeEventListener("keydown", onKey, true);
  }, [catsOpen, shown]);
  const openCats = () => {
    setCatsOpen(true);
    setTimeout(() => focusFirst(document, `g:${group}`), 60); // once the column has come in
  };
  const closeCats = () => {
    setCatsOpen(false);
    focusFirst(document, shown[0] ? `ch-${shown[0].id}` : undefined);
  };

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
        <div>
          <h2>{t("navLive")}</h2>
          <div class="greeting">{p.greeting}</div>
        </div>
        <div class="toolbar">
          <button class="btn tool" data-focus="live-playlist" onClick={p.onPickPlaylist}>
            <Icon name="playlist" size={28} /> <span class="chip-name">{p.playlistName ?? t("noPlaylist")}</span>
          </button>
          <input class="field small" data-focus="live-search" value={query} placeholder={t("filterSearch")}
            onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
          <div class="seg sorts" role="radiogroup" aria-label={t("sortProvider")}>
            {(["provider", "az", "za"] as const).map((v) => (
              <button class="seg-item" key={v} data-focus={`live-sort-${v}`} aria-pressed={sort === v} onClick={() => setSort(v)}>
                {t(v === "provider" ? "sortProvider" : v === "az" ? "sortAz" : "sortZa")}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div class="live-main">
        <Presence show={catsOpen} ms={240}>
          {(out) => (
            <aside class={`groups${out ? " out" : ""}`} onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.keyCode === 39) { e.stopPropagation(); e.preventDefault(); closeCats(); }
            }}>
              <VirtualList
                items={groupItems} rowHeight={ROW} height={LIST_HEIGHT}
                idOf={(g) => `g:${g.key}`}
                renderRow={(g) => (
                  <button class="row" data-focus={`g:${g.key}`} onClick={() => { setGroup(g.key); setCatsOpen(false); }} aria-pressed={group === g.key}>
                    <span class="grow">{g.label}</span>
                    <span class="sub">{g.count}</span>
                  </button>
                )}
              />
            </aside>
          )}
        </Presence>
        <section class="list" onKeyDown={(e) => {
          if ((e.key === "ArrowLeft" || e.keyCode === 37) && !catsOpen && !(e.target instanceof HTMLInputElement)) { e.stopPropagation(); e.preventDefault(); openCats(); }
        }}>
          <div class="list-head">{t("channelsCount", { n: shown.length })}{group === ARCHIVE ? ` · ${t("archiveHint")}` : ""}</div>
          <VirtualList
            key={`${group}|${settled}|${sort}|${ROW}`}
            items={shown} rowHeight={ROW} height={LIST_HEIGHT - 56} pageSize={9}
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
