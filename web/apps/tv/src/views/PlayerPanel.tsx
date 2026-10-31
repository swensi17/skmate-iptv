import { useMemo, useState } from "preact/hooks";
import { groupsOf, type Channel } from "@skmate/core";
import { Drawer, VirtualList } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import type { Settings } from "../state/settings";
import { capitalize } from "../text";
import { ChannelRow } from "./ChannelRow";
import { PlayerSettingRows } from "./PlayerRows";
import { SheetHead } from "./SheetHead";

export type PanelTab = "groups" | "channels" | "recent" | "settings";
const TABS: Array<[PanelTab, "panelGroups" | "panelChannels" | "panelRecent" | "panelSettings"]> = [
  ["groups", "panelGroups"], ["channels", "panelChannels"], ["recent", "panelRecent"], ["settings", "panelSettings"],
];

interface Props {
  /** The edge it came from: Left brings it from the left, Right from the right. */
  side: "left" | "right";
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  closing: boolean;
  onClose: () => void;
  /** The list the viewer is stepping through now. */
  channels: readonly Channel[];
  catalog: readonly Channel[];
  index: number;
  recents: readonly Channel[];
  favorites: ReadonlySet<string>;
  onPick: (c: Channel, list: readonly Channel[]) => void;
  onFav: (c: Channel) => void;
  settings: Settings;
  onChangeSettings: (s: Settings) => void;
}

const ROW = 84;

/** The player's side menu: categories, channels, recently watched, and the player's settings, in one sheet from the right. */
export function PlayerPanel(p: Props) {
  // A category picked in the first tab narrows the channels tab; until then it shows what is being watched.
  const [group, setGroup] = useState<string | null>(null);
  const groups = useMemo(() => groupsOf(p.catalog), [p.catalog]);
  const favs = useMemo(() => p.catalog.filter((c) => p.favorites.has(channelKey(c))), [p.catalog, p.favorites]);
  const list: readonly Channel[] = group === null ? p.channels
    : group === "~all" ? p.catalog
    : group === "~fav" ? favs
    : groups.find((g) => g.name === group)?.channels ?? p.channels;
  const rows = useMemo(() => [
    { key: "~all", label: t("allChannelsShort"), count: p.catalog.length },
    ...(favs.length > 0 ? [{ key: "~fav", label: t("favorites"), count: favs.length }] : []),
    ...groups.map((g) => ({ key: g.name, label: capitalize(g.name), count: g.channels.length })),
  ], [p.catalog.length, favs.length, groups]);

  return (
    <Drawer side={p.side} width={980} label={t("playerMenu")} onClose={p.onClose} closing={p.closing}>
      <SheetHead title={t("playerMenu")} />
      <div class="tabs2">
        {TABS.map(([id, label]) => (
          <button class="tab2" key={id} data-focus={`pp-tab-${id}`} aria-selected={p.tab === id} onClick={() => p.onTab(id)}>{t(label)}</button>
        ))}
      </div>
      {p.tab === "groups" ? (
        <VirtualList
          key="groups" items={rows} rowHeight={ROW} height={780} pageSize={8} autofocus
          idOf={(g) => `pg:${g.key}`}
          renderRow={(g) => (
            <button class="row" data-focus={`pg:${g.key}`} onClick={() => { setGroup(g.key); p.onTab("channels"); }} aria-pressed={group === g.key}>
              <span class="grow">{g.label}</span><span class="sub">{g.count}</span>
            </button>
          )}
        />
      ) : null}
      {p.tab === "channels" ? (
        <VirtualList
          key={`channels|${group}`} items={list} rowHeight={ROW} height={780} pageSize={9} autofocus
          initialIndex={group === null ? p.index : 0}
          idOf={(c) => `pc-${c.id}`}
          renderRow={(c, i) => (
            <ChannelRow channel={c} index={i} favorite={p.favorites.has(channelKey(c))} onOpen={() => p.onPick(c, list)} onFav={p.onFav} />
          )}
        />
      ) : null}
      {p.tab === "recent" ? (
        p.recents.length === 0 ? <div class="list-head">{t("recentEmpty")}</div> : (
          <VirtualList
            key="recent" items={p.recents} rowHeight={ROW} height={780} pageSize={9} autofocus
            idOf={(c) => `pr2-${c.id}`}
            renderRow={(c, i) => (
              <ChannelRow channel={c} index={i} favorite={p.favorites.has(channelKey(c))} onOpen={() => p.onPick(c, p.recents)} onFav={p.onFav} />
            )}
          />
        )
      ) : null}
      {p.tab === "settings" ? (
        <div class="drawer-body drawer-scroll"><PlayerSettingRows settings={p.settings} onChange={p.onChangeSettings} /></div>
      ) : null}
    </Drawer>
  );
}
