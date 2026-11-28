import { isFavorite } from "../state/favorites";
import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { groupsOf, type Channel } from "@skmate/core";
import type { Programme } from "@skmate/epg";
import { focusFirst, Icon, isBack, VirtualList, type IconName } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { channelKey } from "../state/favorites";
import { GuideContext } from "../state/GuideContext";
import { UiContext } from "../state/UiContext";
import { capitalize } from "../text";
import { ChannelLogo } from "./ChannelLogo";
import { CountdownRing, useDwell, useTick } from "./PlayerChrome";
import { useProgrammeArt, type ArtSettings, type ProgrammeArt } from "../state/tmdb";
import { PosterViewer } from "./ProgrammeArt";
import { GuideSide } from "./GuideSide";
import { PanelGuide, scheduleLines, UNDER_HEAD } from "./Schedule";
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
const CATEGORY_FOLLOW_MS = 300;
/** OK held this long on a channel opens its programme instead of tuning it. */
const OK_HOLD_MS = 600;

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
  /** TMDB and the posters switch: the poster and story of a film or series on air under the picture (2.5.3). */
  art: ArtSettings;
  /** OK on an aired programme under the picture: it plays from the archive and the panel closes (2.5.3). */
  onArchive: (c: Channel, p: Programme, list: readonly Channel[]) => void;
}) {
  const ui = useContext(UiContext);
  const { data } = useContext(GuideContext);
  const now = useTick(30_000);
  const history = p.kind === "history";

  // The categories (LiveCategories): Favourites, Recently watched, Catch-up, All channels, then the provider's groups.
  const cats = useMemo<CatItem[]>(() => {
    const favs = p.catalog.filter((c) => isFavorite(p.favorites, c));
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
  // ▶ on a channel: its programme with the archive's days as a column, the same as on the channels screen (#735).
  const [guideCh, setGuideCh] = useState<Channel | null>(null);
  const guideOpen = useRef(false);
  const okHold = useRef<{ held: boolean; timer: ReturnType<typeof setTimeout> } | null>(null);
  guideOpen.current = guideCh !== null;
  const closeGuide = () => { const c = guideCh; setGuideCh(null); setTimeout(() => focusFirst(document, `pc-${(c ?? focused)?.id}`), 0); };
  const start = Math.max(0, list.findIndex((c) => c.id === p.playing.id));
  const listActive = !catsOpen && !menuOpen;
  const dwell = useDwell(focused?.id ?? null, !history && p.preview && listActive && !!focused && focused.id !== p.playing.id,
    CHANNEL_QUIET_MS, () => { if (focused) p.onPreview(focused, list); });

  // ---- Under the picture (2.5.3): the focused channel once it rests (120 ms the name, 250 ms its day), the poster
  // and story of a film or series on it (TMDB), and its guide with the archive's aired programmes above what is on.
  const [head, setHead] = useState<Channel | null>(p.playing);
  const [day, setDay] = useState<Channel | null>(p.playing);
  useEffect(() => {
    if (!focused) return;
    const a = setTimeout(() => setHead(focused), head ? 120 : 0);
    const b = setTimeout(() => setDay(focused), 250);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [focused?.id]);
  const dayItems = day ? data.of(day.id) : null;
  const lines = useMemo(() => (day && head && day.id === head.id && dayItems ? scheduleLines(day, dayItems, Date.now()) : null),
    [day?.id, head?.id, dayItems, Math.floor(now / 60_000)]);
  const onAirLine = lines?.find((l) => l.start <= now && now < l.stop) ?? null;
  const art = useProgrammeArt(onAirLine?.title, p.art);
  const onAirIndex = lines ? Math.max(0, lines.findIndex((l) => now < l.stop)) : 0;
  // The guide starts at the programme before what is on; ▲ at its top brings earlier ones from the archive.
  const [first, setFirst] = useState(0);
  useEffect(() => { setFirst(Math.max(0, onAirIndex - 1)); }, [head?.id, lines?.length]);
  // What is focused under the picture: the poster, a line (its index in [lines]), or nothing (the list has the focus).
  const [uAt, setUAt] = useState<"poster" | number | null>(null);
  const [big, setBig] = useState<ProgrammeArt | null>(null);
  // Where the list under the picture is scrolled: by the focused line, to the top on the poster; it stays while focus
  // is back in the channels (Android keeps its list state), and a new channel starts at the top.
  const [view, setView] = useState<number | null>(null);
  useEffect(() => { if (typeof uAt === "number") setView(uAt); else if (uAt === "poster") setView(null); }, [uAt]);
  useEffect(() => { setView(null); }, [head?.id]);
  const under = useRef({ uAt, big, first, lines, art, onAirIndex });
  under.current = { uAt, big, first, lines, art, onAirIndex };
  useEffect(() => {
    if (uAt === null || big) return;
    document.querySelector<HTMLElement>(`.tp-under [data-ug="${uAt}"]`)?.focus();
  }, [uAt, first, art, big]);
  // A poster that went (another programme, TMDB switched off) takes its focus with it, to the line under it.
  useEffect(() => {
    if (!art && uAt === "poster") setUAt(lines && lines.length > 0 ? onAirIndex : null);
    if (!art) setBig(null);
  }, [art]);
  const toList = () => { setUAt(null); if (focused) focusFirst(document, `pc-${focused.id}`); };
  const pickLine = (i: number) => {
    const l = lines?.[i];
    if (!l || !head) return;
    if (l.archive) p.onArchive(head, l.archive, list);
    else if (l.start <= Date.now() && Date.now() < l.stop) p.onPick(head, list);
  };

  // Categories: the playing list's category focused first. 2.6.9 (#667): resting ~300 ms on another shows its channels
  // beside at once, the categories staying open and the picture playing on; OK or ▶ go into the list.
  const [catFocus, setCatFocus] = useState<string | null>(null);
  const showCat = (key: string) => {
    const item = cats.find((c) => c.key === key);
    if (!item) return;
    memory.key = key;
    setCatKey(key);
    setList(item.channels);
    setFocused(item.channels.find((c) => c.id === p.playing.id) ?? item.channels[0] ?? null);
  };
  useEffect(() => {
    if (!catsOpen || menuOpen || catFocus === null || catFocus === catKey) return;
    const id = setTimeout(() => showCat(catFocus), CATEGORY_FOLLOW_MS);
    return () => clearTimeout(id);
  }, [catFocus, catsOpen, menuOpen, catKey]);
  const pickCat = (key: string) => {
    const item = cats.find((c) => c.key === key);
    if (!item) return;
    memory.key = key;
    setCatKey(key);
    setList(item.channels);
    setFocused(item.channels.find((c) => c.id === p.playing.id) ?? item.channels[0] ?? null);
    setCatsOpen(false);
  };
  const catDwell = { n: 0, startedAt: 0 };

  const focusRail = () => setTimeout(() => focusFirst(document, "pr-home"), 30);
  const focusCats = () => setTimeout(() => focusFirst(document, `pg:${catKey}`), 30);
  useEffect(() => { if (menuOpen) focusRail(); }, [menuOpen]);

  // The panel's own keys, after the player's (which leaves them alone while a panel is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const left = e.key === "ArrowLeft" || e.keyCode === 37;
      const right = e.key === "ArrowRight" || e.keyCode === 39;
      const up = e.key === "ArrowUp" || e.keyCode === 38;
      const down = e.key === "ArrowDown" || e.keyCode === 40;
      const ok = e.key === "Enter" || e.keyCode === 13;
      const back = isBack(e);
      if (guideOpen.current) return; // the programme column takes its own keys
      const u = under.current;
      // The poster over the whole screen: nothing behind it moves; OK or Back closes it, back on the poster.
      if (u.big) {
        if (left || right || up || down || ok || back) {
          e.stopPropagation(); e.preventDefault();
          if ((ok || back) && !e.repeat) setBig(null);
        }
        return;
      }
      // Under the picture: ◀ back to the list, ▲ ▼ through the guide, OK plays the line or opens the poster.
      if (u.uAt !== null && !menuOpen && !catsOpen) {
        if (!left && !right && !up && !down && !ok && !back) return;
        e.stopPropagation();
        e.preventDefault();
        if (back) { p.onDismiss(); return; }
        if (left) { toList(); return; }
        if (right) return;
        const L = u.lines ?? [];
        if (u.uAt === "poster") {
          // ▼ to the line right under the poster: what is on, or the first of the earlier ones brought in above it.
          if (down && L.length > 0) setUAt(u.first === Math.max(0, u.onAirIndex - 1) ? u.onAirIndex : u.first);
          else if (ok && !e.repeat && u.art) setBig(u.art);
          return;
        }
        const i = u.uAt;
        if (up) {
          if (i === u.first && u.first > 0) { setFirst(u.first - 1); setUAt(u.first - 1); }
          else if (i > u.first) setUAt(i - 1);
          else if (u.art) setUAt("poster");
          return;
        }
        if (down) { if (i < L.length - 1) setUAt(i + 1); return; }
        if (ok && !e.repeat) pickLine(i);
        return;
      }
      // OK on a channel: a press tunes it on release, a hold opens its programme with the archive (#761, #768).
      const onRow = (document.activeElement as HTMLElement | null)?.dataset.focus?.startsWith("pc-");
      if (ok && onRow && !menuOpen && !catsOpen && focused) {
        e.stopPropagation(); e.preventDefault();
        if (e.repeat || okHold.current) return;
        const c = focused;
        okHold.current = { held: false, timer: setTimeout(() => { if (okHold.current) okHold.current.held = true; setGuideCh(c); }, OK_HOLD_MS) };
        return;
      }
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
      if (left) { if (history) p.onDismiss(); else { setCatFocus(catKey); setCatsOpen(true); } return; }
      // ▶ in the list: the channel's programme with the archive's days, as on the channels screen (#735).
      if (right && !e.repeat && focused) setGuideCh(focused);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const h = okHold.current;
      if (!h || !(e.key === "Enter" || e.keyCode === 13)) return;
      okHold.current = null;
      clearTimeout(h.timer);
      e.stopPropagation(); e.preventDefault();
      if (!h.held && focused) p.onPick(focused, list);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKeyUp, true);
    return () => { document.removeEventListener("keydown", onKey, true); document.removeEventListener("keyup", onKeyUp, true); };
  }, [menuOpen, catsOpen, history, catKey, list, focused, p.playing.id, head]);

  const rail = (go: Go | "home" | "settings") => {
    if (go === "home") { setMenuOpen(false); p.onDismiss(); return; } // Home is the picture itself
    if (go === "settings") { p.onSettings(); return; }
    p.onGo(go);
  };

  const underTop = dock.y + dock.h + 24;
  const underBox = { left: `${dock.x}px`, top: `${underTop}px`, width: `${dock.w}px` };
  const listIndex = (c: Channel) => list.findIndex((x) => x.id === c.id);
  return (
    <div class={`tp${p.closing ? " out" : ""}`} role="dialog" aria-label={title}>
      {guideCh ? (
        <div class="tp-guide">
          <GuideSide channel={guideCh} art={p.art} active onClose={closeGuide} onLeave={closeGuide}
            onWatch={(c) => { setGuideCh(null); p.onPick(c, list); }}
            onArchive={(c, prog) => { setGuideCh(null); p.onArchive(c, prog, list); }} />
        </div>
      ) : null}
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
                      <button class={`tp-row${playing ? " playing" : ""}`} data-focus={`pc-${c.id}`} onFocus={() => { setFocused(c); setUAt(null); }} onClick={() => p.onPick(c, list)}>
                        {ui.logos ? <span class="tp-row-logo"><ChannelLogo channel={c} /></span> : null}
                        <span class="tp-row-text">
                          <span class="tp-row-name">{ui.numbers ? <span class="n">{i + 1}</span> : null}<span class="t">{c.name}</span>{(c.catchupDays ?? 0) > 0 ? <span class="tp-row-arch"><Icon name="rewind" size={18} /></span> : null}</span>
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
          <div class="tp-under" style={underBox}>
            {head ? (
              <PanelGuide
                channel={head} number={ui.numbers && listIndex(head) >= 0 ? listIndex(head) + 1 : null} now={now}
                lines={lines} first={first} art={art} at={uAt} view={view} viewH={Math.max(UNDER_HEAD, 972 - underTop)}
                onLine={(i) => { setUAt(i); pickLine(i); }} onPoster={() => { setUAt("poster"); if (art) setBig(art); }}
              />
            ) : null}
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
      {/* The poster over the whole screen, from OK on it; focus goes back to it when it closes. */}
      {big ? <PosterViewer art={big} /> : null}
    </div>
  );
}

