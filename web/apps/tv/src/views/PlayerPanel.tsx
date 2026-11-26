import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { groupsOf, type Channel } from "@skmate/core";
import { focusFirst, Icon, isBack, VirtualList, type IconName } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { channelKey } from "../state/favorites";
import { GuideContext } from "../state/GuideContext";
import { UiContext } from "../state/UiContext";
import { capitalize } from "../text";
import { ChannelLogo } from "./ChannelLogo";
import { CountdownRing, useDwell, useTick } from "./PlayerChrome";
import { PanelSchedule } from "./Schedule";
import { Ticks } from "./Spinner";
import "./player.css";

/** The two panels over the picture: ◀ the channels of the playing category, ▶ the recently watched. */
export type PanelTab = "channels" | "history";
/** Places of the app the side menu over the picture leads to. */
export type Go = "live" | "guide" | "sport" | "search";

/** Stage geometry (1728×972 mpx) of TvBoxDock (TvBoxChannelPanel.kt:76-87) and the columns beside it. */
const STAGE_W = 1728;
const DOCK_LEFT = 680;
const DOCK_TOP = 36;
const CATS_W = 440;
const MENU_W = 84;
/** A channel row is 92 high with 4 between; the list fills the column under its title (36 + 31 + 14 above, 24 below). */
const ROW = 96;
const LIST_H = Math.floor((972 - 36 - 31 - 14 - 24) / ROW) * ROW;
const CAT_ROW = 56;
const CATS_H = Math.floor((972 - 30 - 50) / CAT_ROW) * CAT_ROW;
/** DwellTiming: a channel rests 1.5 s before 3-2-1, a category 7 s. */
const CHANNEL_QUIET_MS = 1500;
const CATEGORY_QUIET_MS = 7000;

export interface DockRect { x: number; y: number; w: number; h: number }

/** The picture's corner while the panel is open: right of the list (and of the categories), 36 from the top. */
export function dockRect(inset: number, menu: number): DockRect {
  const w = Math.max(0, STAGE_W - DOCK_LEFT - inset - menu - 36);
  return { x: DOCK_LEFT + inset + menu, y: DOCK_TOP, w, h: Math.round((w * 9) / 16) };
}

/** The category the panel was last on: reopening it lands there while the picture still plays from it. */
const memory: { key: string | null } = { key: null };

interface CatItem { key: string; label: string; count: number; channels: readonly Channel[] }

/** The side menu over the picture (StageRail.kt, TV-box): Home, Sport, Guide, Search, and the gear. */
const RAIL: Array<[string, IconName, Key, Go | "home" | "settings"]> = [
  ["home", "home", "tbNavHome", "home"],
  ["sport", "sports", "navSport", "sport"],
  ["guide", "epg", "navGuide", "guide"],
  ["search", "search", "navSearch", "search"],
  ["more", "settings", "tbNavMore", "settings"],
];

/**
 * The TV-box player's panel (TvBoxChannelPanel.kt + TvBoxPlayerPanels.kt): dark glass over everything but the
 * picture's corner, the channel list on the left, under the picture the focused channel and its day. ◀ in the
 * channels opens the categories beside them (◀ again the side menu); ▶ walks back. OK watches; resting on a row
 * plays it in the corner after 3-2-1 (the live preview setting); Back closes, back to the channel that was on.
 * [onDock] tells the player where the picture goes, so it is laid out there once (never animated: a TV's hardware
 * video plane does not follow a transform).
 */
export function PlayerPanel(p: {
  kind: PanelTab;
  closing: boolean;
  /** The list the player steps through now, the playing channel in it. */
  channels: readonly Channel[];
  catalog: readonly Channel[];
  playing: Channel;
  recents: readonly Channel[];
  favorites: ReadonlySet<string>;
  /** "Live preview": a channel the focus rests on plays in the corner. */
  preview: boolean;
  /** The picture is opening a channel: a spinner in its window. */
  loading: boolean;
  /** OK on a channel: it plays and the panel closes. */
  onPick: (c: Channel, list: readonly Channel[]) => void;
  /** The 3-2-1 on a row ran out: it plays in the corner, the panel stays. */
  onPreview: (c: Channel, list: readonly Channel[]) => void;
  /** Back: the panel closes. */
  onDismiss: () => void;
  onGo: (to: Go) => void;
  onSettings: () => void;
  onDock: (rect: DockRect | null) => void;
}) {
  const ui = useContext(UiContext);
  const { data } = useContext(GuideContext);
  const now = useTick(30_000);
  const history = p.kind === "history";

  // The categories (LiveCategories): Favourites, Recently watched, Catch-up, All channels, then the provider's groups.
  const cats = useMemo<CatItem[]>(() => {
    const favs = p.catalog.filter((c) => p.favorites.has(channelKey(c)));
    const archive = p.catalog.filter((c) => (c.catchupDays ?? 0) > 0);
    return [
      ...(favs.length > 0 ? [{ key: "~fav", label: t("favorites"), count: favs.length, channels: favs }] : []),
      ...(p.recents.length > 0 ? [{ key: "~recent", label: t("groupRecent"), count: p.recents.length, channels: p.recents }] : []),
      ...(archive.length > 0 ? [{ key: "~archive", label: t("groupArchive"), count: archive.length, channels: archive }] : []),
      { key: "~all", label: t("allChannels"), count: p.catalog.length, channels: p.catalog },
      ...groupsOf(p.catalog).map((g) => ({ key: g.name, label: capitalize(g.name) || "—", count: g.channels.length, channels: g.channels })),
    ];
  }, [p.catalog, p.favorites, p.recents]);
  // The category the playing list is: the one picked here last, else the playing channel's own group, else all.
  const initialKey = useMemo(() => {
    const has = (key: string | null) => key !== null && cats.some((c) => c.key === key && c.channels.some((x) => x.id === p.playing.id));
    if (has(memory.key)) return memory.key as string;
    if (p.channels.length === p.catalog.length) return "~all";
    return has(p.playing.group) ? p.playing.group : "~all";
  }, []);
  const [catKey, setCatKey] = useState<string>(initialKey);
  const [list, setList] = useState<readonly Channel[]>(history ? p.recents : p.channels);
  const title = history ? t("tbRecent") : cats.find((c) => c.key === catKey)?.label ?? t("tbChannels");

  const [catsOpen, setCatsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inset = catsOpen ? CATS_W : 0;
  const menu = menuOpen ? MENU_W : 0;
  const dock = dockRect(inset, 0); // the group is pushed by the menu as a whole (tp-group), the picture with it
  useEffect(() => { p.onDock(dockRect(inset, menu)); }, [inset, menu]);
  useEffect(() => () => p.onDock(null), []);

  // Focus is kept by channel: on opening, and back from the categories, the playing one.
  const [focused, setFocused] = useState<Channel | null>(p.playing);
  const start = Math.max(0, list.findIndex((c) => c.id === p.playing.id));
  const listActive = !catsOpen && !menuOpen;
  const dwell = useDwell(focused?.id ?? null, !history && p.preview && listActive && !!focused && focused.id !== p.playing.id,
    CHANNEL_QUIET_MS, () => { if (focused) p.onPreview(focused, list); });

  // Categories: the playing list's category focused first; resting 7 s on another opens it after 3-2-1.
  const [catFocus, setCatFocus] = useState<string | null>(null);
  const pickCat = (key: string) => {
    const item = cats.find((c) => c.key === key);
    if (!item) return;
    memory.key = key;
    setCatKey(key);
    setList(item.channels);
    setFocused(item.channels.find((c) => c.id === p.playing.id) ?? item.channels[0] ?? null);
    setCatsOpen(false);
  };
  const catDwell = useDwell(catFocus, catsOpen && !menuOpen && catFocus !== null && catFocus !== catKey, CATEGORY_QUIET_MS, () => { if (catFocus) pickCat(catFocus); });

  const focusRail = () => setTimeout(() => focusFirst(document, "pr-home"), 30);
  const focusCats = () => setTimeout(() => focusFirst(document, `pg:${catKey}`), 30);
  useEffect(() => { if (menuOpen) focusRail(); }, [menuOpen]);

  // The panel's own keys, after the player's (which leaves them alone while a panel is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const left = e.key === "ArrowLeft" || e.keyCode === 37;
      const right = e.key === "ArrowRight" || e.keyCode === 39;
      const back = isBack(e);
      if (!left && !right && !back) return;
      e.stopPropagation();
      e.preventDefault();
      if (menuOpen) {
        if (left) return; // the menu is the deepest layer
        setMenuOpen(false); // ▶ or Back: to the screen's entry, the categories when they are open
        if (catsOpen) focusCats();
        return;
      }
      if (catsOpen) {
        if (left) { setMenuOpen(true); return; }
        setCatsOpen(false); // ▶ or Back: the channels again, on the playing one
        setFocused(list.find((c) => c.id === p.playing.id) ?? focused);
        return;
      }
      if (back) { p.onDismiss(); return; }
      if (left) { if (history) p.onDismiss(); else { setCatFocus(catKey); setCatsOpen(true); } }
      // ▶ in the list: consumed, it leads nowhere
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [menuOpen, catsOpen, history, catKey, list, focused, p.playing.id]);

  const rail = (go: Go | "home" | "settings") => {
    if (go === "home") { setMenuOpen(false); p.onDismiss(); return; } // Home is the picture itself
    if (go === "settings") { p.onSettings(); return; }
    p.onGo(go);
  };

  const under = { left: `${dock.x}px`, top: `${dock.y + dock.h + 24}px`, width: `${dock.w}px` };
  const listIndex = (c: Channel) => list.findIndex((x) => x.id === c.id);
  return (
    <div class={`tp${p.closing ? " out" : ""}`} role="dialog" aria-label={title}>
      {menuOpen ? (
        <nav class="tp-rail" aria-label={t("playerMenu")}>
          {RAIL.map(([id, icon, label, go]) => (
            <button key={id} class={`tp-rail-item${id === "home" ? " sel" : ""}`} data-focus={`pr-${id}`} aria-label={t(label)} onClick={() => rail(go)}>
              <Icon name={icon} size={32} />
            </button>
          ))}
        </nav>
      ) : null}
      <div class={`tp-group${menuOpen ? " menu" : ""}`}>
        <div class={`tp-in${history ? " from-right" : ""}`}>
          <div class="tp-hole" style={{ left: `${dock.x}px`, width: `${dock.w}px`, height: `${dock.h}px` }} />
          {p.loading ? <div class="tp-spin" style={{ left: `${dock.x}px`, width: `${dock.w}px`, height: `${dock.h}px` }}><div class="spinner"><Ticks /></div></div> : null}
          <div class="tp-list tp-shift" style={{ transform: `translateX(${inset}px)` }}>
            <div class="tp-title">{title}</div>
            <div class="tp-rows">
              {list.length === 0 ? <div class="tp-none">{t("recentEmpty")}</div> : (
                <VirtualList
                  key={`${p.kind}|${catKey}|${listActive}`} items={list} rowHeight={ROW} height={LIST_H} pageSize={9} autofocus={listActive}
                  initialIndex={Math.max(0, focused ? list.findIndex((c) => c.id === focused.id) : start)}
                  idOf={(c) => `pc-${c.id}`}
                  renderRow={(c, i) => {
                    const on = ui.program ? data.nowNext(c.id, now) : { now: null, progress: 0 };
                    const playing = c.id === p.playing.id;
                    const counting = !playing && dwell.n > 0 && focused?.id === c.id;
                    return (
                      <button class={`tp-row${playing ? " playing" : ""}`} data-focus={`pc-${c.id}`} onFocus={() => setFocused(c)} onClick={() => p.onPick(c, list)}>
                        {ui.logos ? <span class="tp-row-logo"><ChannelLogo channel={c} /></span> : null}
                        <span class="tp-row-text">
                          <span class="tp-row-name">{ui.numbers ? <span class="n">{i + 1}</span> : null}<span class="t">{c.name}</span></span>
                          {on.now ? (
                            <>
                              <span class="tp-row-prog">{on.now.title}</span>
                              <span class="tp-row-bar"><i style={{ width: `${Math.round(on.progress * 100)}%` }} /></span>
                            </>
                          ) : <span class="tp-row-prog">{t("tbNoGuideShort")}</span>}
                        </span>
                        {counting ? <span class="tp-row-end"><CountdownRing n={dwell.n} totalMs={3000} startedAt={dwell.startedAt} /></span>
                          : playing ? <span class="tp-row-end" aria-label={t("tbLive")}><Icon name="pause" size={30} /></span> : null}
                      </button>
                    );
                  }}
                />
              )}
            </div>
          </div>
          <div class="tp-under" style={under}>
            <PanelSchedule channel={focused} number={focused && ui.numbers && listIndex(focused) >= 0 ? listIndex(focused) + 1 : null} now={now} />
          </div>
        </div>
        {catsOpen ? (
          <div class="tp-cats">
            <div class="tp-cats-title">{t("tbCategories")}</div>
            <VirtualList
              key="cats" items={cats} rowHeight={CAT_ROW} height={CATS_H} pageSize={10} autofocus={!menuOpen}
              initialIndex={Math.max(0, cats.findIndex((c) => c.key === catKey))}
              idOf={(c) => `pg:${c.key}`}
              renderRow={(c) => (
                <button class={`st-focusable st-sheet-item${c.key === catKey ? " sel" : ""}`} data-focus={`pg:${c.key}`}
                  onFocus={() => setCatFocus(c.key)} onClick={() => pickCat(c.key)}>
                  <Icon name="live_tv" size={28} />
                  <span class="st-sheet-item-text">{c.label}</span>
                  {catDwell.n > 0 && catFocus === c.key ? <CountdownRing n={catDwell.n} totalMs={3000} startedAt={catDwell.startedAt} /> : <span class="st-count">{c.count}</span>}
                </button>
              )}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

