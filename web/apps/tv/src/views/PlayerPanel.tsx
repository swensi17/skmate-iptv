import { useEffect, useMemo, useState } from "preact/hooks";
import { groupsOf, type Channel } from "@skmate/core";
import { Drawer, focusFirst, Icon, VirtualList } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import type { Settings } from "../state/settings";
import { capitalize } from "../text";
import { ChannelRow } from "./ChannelRow";
import { PlayerSettingRows } from "./PlayerRows";
import { SheetHead } from "./SheetHead";

/** "browse" is the menu of categories and channels; "settings" is the player's own settings. */
export type PanelTab = "browse" | "settings";
export type Go = "live" | "guide" | "sport" | "search";

interface Props {
  /** The edge it came from: Left brings it from the left, Right from the right. */
  side: "left" | "right";
  tab: PanelTab;
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
  /** Leave the player for a place of the app. */
  onGo: (to: Go) => void;
}

const ROW = 84;
/** The room the player's bar keeps at the bottom of the screen. */
export const BAR_ROOM = 270;
const BODY = 1080 - BAR_ROOM - 140;

/**
 * The player's menu: a narrow column of categories (Home first, then what was watched lately, the favourites, all
 * channels and the playlist's groups) and, beside it, the channels of the one picked. The bar stays visible under it.
 */
export function PlayerPanel(p: Props) {
  // null: what is being watched now; otherwise a category picked in the column.
  const [group, setGroup] = useState<string | null>(null);
  const groups = useMemo(() => groupsOf(p.catalog), [p.catalog]);
  const favs = useMemo(() => p.catalog.filter((c) => p.favorites.has(channelKey(c))), [p.catalog, p.favorites]);
  const list: readonly Channel[] = group === null ? p.channels
    : group === "~all" ? p.catalog
    : group === "~fav" ? favs
    : group === "~recent" ? p.recents
    : groups.find((g) => g.name === group)?.channels ?? p.channels;
  const cats = useMemo(() => [
    { key: "~recent", label: t("panelRecent"), count: p.recents.length },
    ...(favs.length > 0 ? [{ key: "~fav", label: t("favorites"), count: favs.length }] : []),
    { key: "~all", label: t("allChannelsShort"), count: p.catalog.length },
    ...groups.map((g) => ({ key: g.name, label: capitalize(g.name), count: g.channels.length })),
  ], [p.recents.length, favs.length, p.catalog.length, groups]);

  useEffect(() => {
    if (p.tab === "settings") focusFirst(document, "s-engine");
    else focusFirst(document, group === null ? `pc-${p.channels[p.index]?.id}` : undefined);
  }, [p.tab]);

  const modal = p.tab === "settings";
  return (
    <Drawer side={p.side} width={modal ? 980 : 1240} label={t("playerMenu")} onClose={p.onClose} closing={p.closing} modal={false} bottomGap={BAR_ROOM}>
      <SheetHead title={modal ? t("panelSettings") : t("playerMenu")} />
      {p.tab === "browse" ? (
        <div class="pp-cols">
          <aside class="pp-cats">
            <button class="menu-row" data-focus="pm-home" onClick={() => p.onGo("live")}>
              <Icon name="home" size={36} /><span class="grow">{t("menuHome")}</span>
            </button>
            <VirtualList
              key="cats" items={cats} rowHeight={ROW} height={BODY - 90} pageSize={7}
              idOf={(g) => `pg:${g.key}`}
              renderRow={(g) => (
                <button class="row" data-focus={`pg:${g.key}`} aria-pressed={group === g.key} onClick={() => { setGroup(g.key); setTimeout(() => focusFirst(document), 0); }}>
                  <span class="grow">{g.label}</span><span class="sub">{g.count}</span>
                </button>
              )}
            />
          </aside>
          <section class="pp-chs">
            {list.length === 0 ? <div class="list-head">{t("recentEmpty")}</div> : (
              <VirtualList
                key={`channels|${group}`} items={list} rowHeight={ROW} height={BODY} pageSize={8}
                initialIndex={group === null ? p.index : 0}
                idOf={(c) => `pc-${c.id}`}
                renderRow={(c, i) => (
                  <ChannelRow channel={c} index={i} favorite={p.favorites.has(channelKey(c))} onOpen={() => p.onPick(c, list)} onFav={p.onFav} />
                )}
              />
            )}
          </section>
        </div>
      ) : (
        <div class="drawer-body drawer-scroll"><PlayerSettingRows settings={p.settings} onChange={p.onChangeSettings} /></div>
      )}
    </Drawer>
  );
}
