import { isFavorite } from "../state/favorites";
import { GuideSide } from "./GuideSide";
import type { ArtSettings } from "../state/tmdb";
import { Fragment } from "preact";
import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { groupsOf, type Channel } from "@skmate/core";
import type { Programme } from "@skmate/epg";
import { focusFirst, isBack, Menu, MenuItem, Presence, VirtualList } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import { scoped } from "../state/scope";
import type { Settings } from "../state/settings";
import type { Status } from "../state/usePlaylists";
import { ChannelSearch } from "../state/channelSearch";
import { interestRank } from "../state/interests";
import { GuideContext } from "../state/GuideContext";
import { GroupIcon, StageIcon } from "./GroupIcon";
import { ChannelRow } from "./ChannelRow";
import { PreviewPane } from "./PreviewPane";
import { SearchEntry } from "./EntryRow";
import { SIcon } from "./SettingsKit";
import "./home.css";

/*
 * The channels screen ("Ваши каналы"), Android's Live TV in the TV-box look: features/live/LiveScreen.kt (state, keys,
 * layout) and LiveStage.kt (header, rows, stage, categories). Geometry in design px (= Android mpx) on the 1728×972
 * stage; horizontal positions are Android's fx() fractions of the screen width (fx(n) = 1728·n/1920).
 */

// Keys of the built-in groups; a leading "~" keeps them apart from any group a provider names.
const FAV = "~fav";
const ALL = "~all";
const RECENT = "~recent";
const ARCHIVE = "~archive";
/** Row 92 + the 8 between rows (LiveScreen.kt spacedBy(8), LiveStage.kt height 92). */
const ROW_PITCH = 100;
/** The list runs from 186 (toolbar 118 + 48 + 20) to the bottom of the stage. */
const LIST_TOP = 186;
const LIST_HEIGHT = 972 - LIST_TOP;
/** Focus resting this long on a row moves the preview to it (LiveScreen.kt PreviewDwellMs). */
const DWELL_MS = 1000;
const TYPING_PAUSE_MS = 180;
/** The categories need a search field only past this many entries (LiveStage.kt CategorySearchMin). */
const CATEGORY_SEARCH_MIN = 20;
/** Focus resting on another category this long shows its channels beside (2.6.9). */
const CATEGORY_FOLLOW_MS = 300;

/** LiveSort.kt LiveSortModes, in Android's order. */
type Sort = "provider" | "az" | "za" | "number" | "recent";
const SORTS: Sort[] = ["provider", "az", "za", "number", "recent"];
const SORT_KEY = "skmate.liveSort";
const SORT_TEXT: Record<Sort, { name: Parameters<typeof t>[0]; hint: Parameters<typeof t>[0] }> = {
  provider: { name: "homeSortProviderOrder", hint: "homeSortProviderOrderHint" },
  az: { name: "homeSortAlpha", hint: "homeSortAlphaHint" },
  za: { name: "homeSortAlphaDesc", hint: "homeSortAlphaDescHint" },
  number: { name: "homeSortNumber", hint: "homeSortNumberHint" },
  recent: { name: "homeSortRecent", hint: "homeSortRecentHint" },
};

/** "On now" picks of the ⋯ menu (core/content/SmartPicks.kt): words looked for in what is on air. */
type Pick = "sport" | "movies" | "news" | "kids";
const PICKS: Array<{ id: Pick; label: Parameters<typeof t>[0]; words: string[] }> = [
  { id: "sport", label: "homePickSport", words: ["футбол", "хоккей", "баскетбол", "теннис", "бокс", "ufc", "формула", "спорт", "football", "soccer", "sport"] },
  { id: "movies", label: "homePickMovies", words: ["фильм", "кино", "movie", "film", "cinema"] },
  { id: "news", label: "homePickNews", words: ["новости", "news", "итоги", "вести"] },
  { id: "kids", label: "homePickKids", words: ["мульт", "детск", "cartoon", "kids"] },
];
const PICK_LIMIT = 40;

interface GroupItem { key: string; label: string; count: number }

/** What leaving the side menu does here (Android's onEntryHook): into the open categories, else onto the channel row. */
export interface LiveEntry {
  /** Focus the screen's own way in; false when there was nothing to focus. */
  enter: () => boolean;
  /** The categories beside the menu close and the channel row gets the focus; false when they were not open. */
  closeBeside: () => boolean;
}

/**
 * The channel screen goes away while a channel plays full screen. What the viewer had chosen (the category, the
 * filter and the channel the cursor was on) waits here, so Back from the player lands on that same row instead of the
 * top of "All channels". A profile switch reloads the page, which starts this afresh.
 */
const memory: { group: string; query: string; channel: string | null } = { group: ALL, query: "", channel: null };

/*
 * settings functions (Android): Просмотр и списки › remember the last category / the last channel of Live TV across
 * restarts (SettingsRepository remember_cat_live / remember_last_live, kept per profile, saved 800 ms after a change),
 * and Запуск приложения › "Прямой эфир · Избранное" (the channels open on Favourites).
 */
const LAST_KEY = "skmate.liveLast";
const SAVE_MS = 800;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** The channel is kept by its tvg-id and name: a refreshed playlist renumbers its channels and may renew tokens in the
 * addresses, and timeshift copies share one tvg-id. */
const rowKey = (c: Channel): string => `${c.tvgId ?? ""}|${c.name}`;
let lastKey: string | null = null;
/** The key restored at start, until the playlist is there to find it in. */
let pendingKey: string | null = null;
let primed = false;
function writeLast(): void {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  try { localStorage.setItem(scoped(LAST_KEY), JSON.stringify({ group: memory.group, channel: lastKey })); } catch { /* not remembered */ }
}
function saveLast(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeLast, SAVE_MS);
}
// Leaving the app (Home, another input, power off) writes the place at once: one moved just before must not be lost
// to the timer (2.6.9, #650).
if (typeof window !== "undefined") {
  const flush = () => { if (saveTimer !== undefined) writeLast(); };
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  document.addEventListener("webOSRelaunch", flush);
}

/** Before the channels screen first opens: where it starts. Off = "All channels", at the top (Android LiveKey.All). */
export function primeLive(o: { favorites: boolean; rememberGroup: boolean; rememberItem: boolean }): void {
  if (primed) return; // once per start: a shell drawn again must not send the screen back to where it began
  primed = true;
  let last: { group?: unknown; channel?: unknown } = {};
  try { last = JSON.parse(localStorage.getItem(scoped(LAST_KEY)) ?? "{}") as typeof last; } catch { /* nothing kept */ }
  memory.group = o.favorites ? FAV : o.rememberGroup && typeof last.group === "string" && last.group ? last.group : ALL;
  memory.channel = null;
  pendingKey = o.rememberItem && typeof last.channel === "string" ? last.channel : null;
  lastKey = typeof last.channel === "string" ? last.channel : null;
}

function loadSort(): Sort {
  try { const v = localStorage.getItem(SORT_KEY) as Sort | null; return v && SORTS.includes(v) ? v : "provider"; } catch { return "provider"; }
}

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
  /** «Вид телегида»: the guide in place of the list. */
  onGuideView?: () => void;
  /** OK on a programme to come in the schedule under the preview: watch or be reminded. */
  onUpcoming?: (c: Channel, p: Programme, list: readonly Channel[]) => void;
  /** OK on an aired programme in the channel's guide (▶ on a channel, 2.6.0): play it from the archive. */
  onArchive?: (c: Channel, p: Programme, list: readonly Channel[]) => void;
  /** The shell's hook for the side menu (▶ / Back out of it, OK on Home beside open categories). */
  entry?: { current: LiveEntry | null };
  /** screens 2.5.4 (Android LiveMoreMenu): adult categories; null when the lock is off, true while they are closed. */
  adultLocked?: boolean | null;
  /** The More menu's adult row: open them (asks the PIN) or close them again. */
  onAdult?: () => void;
}

export function LiveView(p: Props) {
  const groups = useMemo(() => groupsOf(p.channels), [p.channels]);
  const favs = useMemo(() => p.channels.filter((c) => isFavorite(p.favorites, c)), [p.channels, p.favorites]);
  const numbers = useMemo(() => new Map(p.channels.map((c, i) => [c.id, i + 1])), [p.channels]);
  const [group, setGroupState] = useState<string>(memory.group);
  const [sort, setSortState] = useState<Sort>(loadSort);
  const [query, setQueryState] = useState(memory.query);
  const [settled, setSettled] = useState(memory.query);
  const setGroup = (g: string) => { memory.group = g; setGroupState(g); saveLast(); };
  // A remembered provider category that this playlist no longer has: back to "All channels" (Android restores it only
  // while it still exists).
  useEffect(() => {
    if (p.channels.length === 0 || group.charAt(0) === "~" || groups.some((g) => g.name === group)) return;
    memory.channel = null;
    setGroup(ALL);
  }, [groups, group]);
  const setSort = (v: Sort) => { try { localStorage.setItem(SORT_KEY, v); } catch { /* this session only */ } setSortState(v); };
  const setQuery = (q: string) => { memory.query = q; memory.channel = null; setQueryState(q); };
  const [catsOpen, setCatsOpen] = useState(false);
  const [catQuery, setCatQuery] = useState("");
  const [menu, setMenu] = useState<null | "sort" | "more" | Pick>(null);
  // The row under the cursor, kept out of state: a key press must not redraw the whole screen (a weak TV feels each one).
  // Only whether it has left the preview's channel is state: the preview's picture stops while it has (one decoder).
  const focusedRef = useRef<Channel | null>(null);
  const [away, setAway] = useState(false);
  // ▶ on a channel puts its guide in the list's place; ◀ or Back bring the list back (2.6.0 LiveGuideSide).
  const [guideCh, setGuideCh] = useState<Channel | null>(null);
  const artSettings = useMemo<ArtSettings>(() => ({
    metadataOn: p.settings.metadataOn, tmdbKey: p.settings.tmdbKey, tmdbLanguage: p.settings.tmdbLanguage, programmePosters: p.settings.programmePosters,
  }), [p.settings.metadataOn, p.settings.tmdbKey, p.settings.tmdbLanguage, p.settings.programmePosters]);
  // The channels watched before carry the history mark; worked out once per history, not on every step (2.6.1).
  const watchedIds = useMemo(() => new Set(p.recents.slice(0, 200).map((c) => c.id)), [p.recents]);
  // 2.6.7: the programme is a column in the preview's place; the list stays. ◀ from it back to the list, the column
  // following the channel the list is on; ▶ into it again; ◀ on the list (or Back) closes it.
  const [guideActive, setGuideActive] = useState(false);
  const guideFollow = useRef<ReturnType<typeof setTimeout>>();
  const leaveGuide = () => {
    setGuideActive(false);
    const id = guideCh?.id;
    setTimeout(() => {
      const row = id ? document.querySelector<HTMLElement>(`.home-rows [data-focus="ch-${CSS.escape ? CSS.escape(id) : id}"]`) : null;
      if (row) row.focus(); else focusCurrentRow();
    }, 0);
  };
  const [dwelled, setDwelled] = useState<Channel | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const archive = useMemo(() => p.channels.filter((c) => (c.catchupDays ?? 0) > 0), [p.channels]);
  const base = group === FAV ? favs : group === RECENT ? p.recents : group === ARCHIVE ? archive : group === ALL ? p.channels : groups.find((g) => g.name === group)?.channels ?? [];
  const guide = useContext(GuideContext);
  const index = useMemo(() => new ChannelSearch(base, guide.data, guide.now), [base, guide.data, Math.floor(guide.now / 60_000)]);
  const found = useMemo(() => (settled.trim() === "" ? base : index.search(settled)), [base, index, settled]);
  const shown = useMemo(() => {
    if (sort === "provider" || sort === "number" || settled.trim() !== "") return found;
    if (sort === "recent") {
      const order = new Map(p.recents.map((c, i) => [c.id, i]));
      return found.map((c, i) => ({ c, i })).sort((a, b) => (order.get(a.c.id) ?? 1e9) - (order.get(b.c.id) ?? 1e9) || a.i - b.i).map((x) => x.c);
    }
    const copy = [...found].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return sort === "az" ? copy : copy.reverse();
  }, [found, sort, settled, p.recents]);

  // Favourites and Recently watched always; Archive only when some channel keeps one (LiveViewModel.kt railItems).
  const groupItems = useMemo<GroupItem[]>(() => [
    { key: FAV, label: t("homeFavorites"), count: favs.length },
    { key: RECENT, label: t("homeRecent"), count: p.recents.length },
    ...(archive.length > 0 ? [{ key: ARCHIVE, label: t("homeArchive"), count: archive.length }] : []),
    { key: ALL, label: t("homeAll"), count: p.channels.length },
    ...groups.map((g) => ({ key: g.name, label: g.name, count: g.channels.length }))
      .map((g, i) => ({ g, i })).sort((a, b) => interestRank(a.g.label, p.settings.interests) - interestRank(b.g.label, p.settings.interests) || a.i - b.i).map((x) => x.g),
  ], [p.channels, favs.length, p.recents.length, archive.length, groups, p.settings.interests]);
  const groupLabel = groupItems.find((g) => g.key === group)?.label ?? t("homeAll");
  const firstGroup = groupItems.findIndex((g) => !g.key.startsWith("~"));
  const catSearch = groupItems.length > CATEGORY_SEARCH_MIN || catQuery !== "";
  const catShown = useMemo(() => {
    const q = catQuery.trim().toLowerCase();
    return q === "" ? groupItems : groupItems.filter((g) => g.label.toLowerCase().indexOf(q) >= 0);
  }, [groupItems, catQuery]);

  // The row the cursor was on before a channel was opened, while it is still in the list; else the first.
  if (pendingKey !== null && p.channels.length > 0) {
    const key = pendingKey;
    pendingKey = null;
    memory.channel = p.channels.find((c) => rowKey(c) === key)?.id ?? null;
  }
  const back = memory.channel !== null ? shown.findIndex((c) => c.id === memory.channel) : -1;
  const [preview, setPreview] = useState<Channel | null>(() => (back >= 0 ? shown[back] : shown[0]) ?? null);
  useEffect(() => { if (dwelled) setPreview(dwelled); }, [dwelled]);
  useEffect(() => { setAway(!!preview && !!focusedRef.current && focusedRef.current.id !== preview.id); }, [preview?.id]);
  // A playlist that arrives after the screen opened: the preview starts on the remembered (or the first) channel.
  useEffect(() => { if (!preview && shown.length > 0) setPreview((back >= 0 ? shown[back] : shown[0]) ?? null); }, [shown.length > 0]);
  useEffect(() => {
    if (catsRef.current) return; // the list follows the category the cursor is on (2.6.9): the cursor stays there
    const id = back >= 0 ? memory.channel : shown[0]?.id;
    focusFirst(document, id ? `ch-${id}` : "live-search");
  }, [group, p.channels.length === 0]);
  useEffect(() => { const id = setTimeout(() => setSettled(query), TYPING_PAUSE_MS); return () => clearTimeout(id); }, [query]);
  useEffect(() => () => clearTimeout(timer.current), []);

  /** The channel's row: the one in the preview (Android: the previewed channel), else the remembered one, else the first drawn. */
  const focusCurrentRow = (): boolean => {
    const ids = [preview?.id, memory.channel].filter((x): x is string => !!x);
    for (const id of ids) {
      const el = document.querySelector<HTMLElement>(`.home-rows [data-focus="ch-${CSS.escape ? CSS.escape(id) : id}"]`);
      if (el) { el.focus(); return true; }
    }
    const first = document.querySelector<HTMLElement>(".home-rows [data-focus]");
    if (first) { first.focus(); return true; }
    return false;
  };
  const focusSelectedCategory = () => {
    const box = document.querySelector(".home-cats");
    if (!box) return false;
    const all = Array.from(box.querySelectorAll<HTMLElement>("[data-focus]"));
    const el = all.find((e) => e.dataset.focus === `g:${group}`) ?? all.find((e) => e.dataset.focus?.startsWith("g:")) ?? all[0];
    el?.focus();
    return !!el;
  };
  const openCats = () => {
    setCatsOpen(true);
    setTimeout(focusSelectedCategory, 0); // the next frame: the sheet is drawn
  };
  const closeCats = () => {
    setCatsOpen(false);
    focusCurrentRow();
  };
  const catsRef = useRef(catsOpen);
  catsRef.current = catsOpen;
  if (p.entry) {
    p.entry.current = {
      enter: () => (catsRef.current ? focusSelectedCategory() : focusCurrentRow()),
      closeBeside: () => { if (!catsRef.current) return false; closeCats(); return true; },
    };
  }
  useEffect(() => () => { if (p.entry) p.entry.current = null; }, []);

  // Back while the focus is in the categories: a typed search is cleared first, then the sheet closes (before the
  // app's own Back, which would leave the screen). Back in a toolbar menu closes it and returns to its tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isBack(e) || document.querySelector(".st-popup-layer[data-modal]")) return; // the text entry's own Back
      if (menu !== null) { e.stopPropagation(); e.preventDefault(); closeMenu(); return; }
      const inCats = !!(document.activeElement as HTMLElement | null)?.closest(".home-cats");
      if (!(catsOpen && inCats)) return;
      e.stopPropagation(); e.preventDefault();
      if (catQuery !== "") { setCatQuery(""); setTimeout(() => focusFirst(document, "cat-search"), 0); return; }
      closeCats();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [catsOpen, catQuery, menu, shown, preview]);

  // The preview follows the cursor only after it has rested on a channel: listing fast must not open a stream per row.
  const onFocusChannel = (c: Channel) => {
    memory.channel = c.id;
    lastKey = rowKey(c);
    saveLast();
    focusedRef.current = c;
    // The middle column always shows the programme of the channel the cursor rests on (#760).
    clearTimeout(guideFollow.current); guideFollow.current = setTimeout(() => setGuideCh(c), 150);
    setAway(!!preview && c.id !== preview.id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDwelled(c), DWELL_MS);
  };

  // 2.6.9 (#651): the list beside follows the category the cursor rests on, after a short pause (not on every step),
  // the categories staying open; OK or ▶ go into the list.
  const [catFocus, setCatFocus] = useState<string | null>(null);
  const countdown = 0;
  useEffect(() => {
    if (!catsOpen || catFocus === null || catFocus === group || menu !== null) return;
    const id = setTimeout(() => { memory.channel = null; setGroup(catFocus); }, CATEGORY_FOLLOW_MS);
    return () => clearTimeout(id);
  }, [catFocus, catsOpen, group, menu]);
  const pickCategory = (key: string) => {
    if (key !== group) { memory.channel = preview?.id ?? null; setGroup(key); }
    setCatsOpen(false);
    if (key === group) focusCurrentRow();
  };

  const [menuFrom, setMenuFrom] = useState<string>("live-sort");
  const openMenu = (m: NonNullable<typeof menu>, from: string) => { setMenuFrom(from); setMenu(m); };
  const closeMenu = () => { setMenu(null); setTimeout(() => focusFirst(document, menuFrom), 0); };
  const picks = useMemo(() => {
    const pick = PICKS.find((x) => x.id === menu);
    if (!pick) return [];
    const out: Array<{ c: Channel; title: string; start: number }> = [];
    for (const c of p.channels) {
      const on = guide.data.nowNext(c.id, guide.now).now;
      if (!on) continue;
      const text = `${on.title} ${on.desc ?? ""}`.toLowerCase();
      if (pick.words.some((w) => text.indexOf(w) >= 0)) out.push({ c, title: on.title, start: on.start });
    }
    return out.sort((a, b) => a.start - b.start).slice(0, PICK_LIMIT);
  }, [menu, p.channels, guide.data, guide.now]);

  if (p.channels.length === 0 && p.status.kind !== "loading") {
    return (
      <div class="screen empty">
        <div class="empty-title">{t("emptyTitle")}</div>
        <div class="empty-hint">{p.status.kind === "error" ? p.status.message : t("emptyHint")}</div>
        <div class="empty-actions">
          <button class="btn" data-focus="empty-add" onClick={p.onAddPlaylist}>{t("emptyAdd")}</button>
          <button class="btn" data-focus="empty-demo" onClick={p.onDemo}>{t("emptyDemo")}</button>
        </div>
      </div>
    );
  }

  const stop = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); };
  const key = (e: KeyboardEvent, name: string, code: number) => e.key === name || e.keyCode === code;
  // The toolbar: ◀ on the search opens the categories; ▲ goes nowhere; ▼ lands on the current channel row; ▶ never
  // leaves the toolbar for the stage beside it (LiveScreen.kt focus rules).
  const onToolsKey = (e: KeyboardEvent) => {
    const id = (document.activeElement as HTMLElement | null)?.dataset.focus;
    if (key(e, "ArrowUp", 38)) { stop(e); return; }
    if (key(e, "ArrowDown", 40)) { stop(e); if (!focusCurrentRow()) focusFirst(document); return; }
    if (key(e, "ArrowLeft", 37) && id === "live-search") { stop(e); openCats(); return; }
    if (key(e, "ArrowRight", 39) && id === "live-more") { stop(e); }
  };
  // A row: ◀ the categories, ▶ the schedule under the preview, ▼ past the last row nowhere (▲ past the first: the toolbar).
  const onListKey = (e: KeyboardEvent) => {
    if (!(e.target as HTMLElement).closest?.("[data-index]")) return;
    if (key(e, "ArrowLeft", 37)) { stop(e); openCats(); return; }
    if (key(e, "ArrowRight", 39)) {
      stop(e);
      if (focusedRef.current && !catsOpen) { clearTimeout(guideFollow.current); setGuideCh(focusedRef.current); setGuideActive(true); }
      return;
    }
    if (key(e, "ArrowDown", 40)) stop(e); // the list handles every Down it can; this one is past the last row
  };
  // The categories: ▲/▼ walk them in order and stop at the ends, ▶ closes the sheet; ◀ is left to the app (the menu).
  const onCatsKey = (e: KeyboardEvent) => {
    if (key(e, "ArrowRight", 39)) { stop(e); closeCats(); return; }
    const dir = key(e, "ArrowUp", 38) ? -1 : key(e, "ArrowDown", 40) ? 1 : 0;
    if (dir === 0) return;
    stop(e);
    const all = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-focus]"));
    const at = all.indexOf(document.activeElement as HTMLElement);
    all[Math.max(0, Math.min(all.length - 1, at + dir))]?.focus();
  };
  // Edge scrolling in the categories: the focused row and one more stay in view (LiveStage.kt edgeScrollSpec).
  const catList = useRef<HTMLDivElement>(null);
  const onCatsFocus = (e: FocusEvent) => {
    const el = e.target as HTMLElement;
    setCatFocus(el.dataset.focus?.startsWith("g:") ? el.dataset.focus.slice(2) : null);
    const box = catList.current;
    if (!box || !box.contains(el)) return;
    const room = Math.min(el.offsetHeight, (box.clientHeight - el.offsetHeight) / 2);
    const top = el.offsetTop - room;
    const bottom = el.offsetTop + el.offsetHeight + room;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  };
  const listKey = `${group}|${settled}|${sort}`;
  const playing = p.settings.preview && !p.paused ? preview?.id ?? null : null;
  const empty = shown.length === 0;
  const emptyText = settled.trim() !== "" ? t("homeNoChannelsFound", { q: settled.trim() }) : p.channels.length === 0 ? t("homeNoPlaylist") : t("homeNoChannelsHere");

  return (
    <div class="screen home">
      <div class={`home-side home-3col${catsOpen ? " pushed" : ""}`} onFocusIn={() => { if (catsRef.current) setCatsOpen(false); }}>
        <h1 class="home-title">{t("navLive")}</h1>
        <div class="home-list">
          <div class="home-tools" onKeyDown={onToolsKey as unknown as (e: Event) => void} onFocusIn={() => clearTimeout(timer.current)}>
            <SearchEntry id="live-search" value={query} placeholder={t("homeSearchIn", { name: groupLabel })}
              entryTitle={t("homeSearchIn", { name: groupLabel })} entryHint={t("searchChannelsHint")}
              count={(q) => index.search(q).length} results=".home-rows .vlist"
              onDone={(v) => { setQuery(v); setSettled(v); }} />
            <button class="st-focusable st-tool boxed home-tool" data-focus="live-sort" onClick={() => openMenu("sort", "live-sort")}>
              <StageIcon name="sort" size={20} /><span class="st-tool-value">{sort === "provider" ? t("homeProvider") : t(SORT_TEXT[sort].name)}</span>
            </button>
            <button class="st-focusable st-tool boxed home-tool" data-focus="live-guide" onClick={() => p.onGuideView?.()}>
              <StageIcon name="grid" size={20} /><span>{t("homeGuideView")}</span>
            </button>
            <button class="st-focusable st-tool boxed home-tool" data-focus="live-more" aria-label={t("homeMoreTitle")} onClick={() => openMenu("more", "live-more")}>
              <StageIcon name="more" size={20} />
            </button>
          </div>
          <div class="home-rows" key={listKey} onKeyDown={onListKey as unknown as (e: Event) => void}>
            {p.channels.length === 0 ? <ListSkeleton /> : empty ? (
              <div class="home-empty">
                <StageIcon name="tv" size={72} />
                <div class="home-empty-text">{emptyText}</div>
              </div>
            ) : (
              <VirtualList
                items={shown} rowHeight={ROW_PITCH} height={LIST_HEIGHT} pageSize={10} room={1} initialIndex={Math.max(0, back)}
                idOf={(c) => `ch-${c.id}`}
                renderRow={(c, i) => (
                  <ChannelRow variant="live" channel={c} index={i} number={numbers.get(c.id)} favorite={isFavorite(p.favorites, c)}
                    previewing={playing === c.id} watched={watchedIds.has(c.id)}
                    onOpen={(ch) => { clearTimeout(timer.current); p.onOpen(ch, shown); }} onFav={p.onFav} onFocus={onFocusChannel} />
                )}
              />
            )}
          </div>
        </div>
        {/* Three columns (#760): channels, the programme of the one under the cursor, the picture. Hidden while the
            categories are open, so the sheet never covers it halfway. "Back" in it goes back to the channels. */}
        {(guideCh ?? preview) && !catsOpen ? (
          <GuideSide channel={(guideCh ?? preview) as Channel} art={artSettings} onClose={leaveGuide} onLeave={leaveGuide} active={guideActive}
            onWatch={(c) => { setGuideActive(false); clearTimeout(timer.current); p.onOpen(c, shown); }}
            onArchive={(c, prog) => { setGuideActive(false); p.onArchive?.(c, prog, shown); }}
            onUpcoming={(c, prog) => p.onUpcoming?.(c, prog, shown)} />
        ) : null}
        <PreviewPane channel={p.paused ? null : preview} away={away} settings={p.settings}
          number={preview ? numbers.get(preview.id) : undefined}
          onBack={() => focusCurrentRow()}
          onProgramme={(c, prog) => p.onUpcoming?.(c, prog, shown)} />
      </div>

      {/* Built once and only slid in and out (2.6.3): no long first frame on ◀, the list and the panel move as one. */}
      {(
          <aside class={`home-cats${catsOpen ? " open" : ""}`} aria-hidden={!catsOpen} onKeyDown={onCatsKey as unknown as (e: Event) => void}
            onFocusIn={onCatsFocus as unknown as (e: Event) => void} onFocusOut={() => setCatFocus(null)}>
            <div class="home-cats-title">{t("homeCategories")}</div>
            <div class="home-cats-list" ref={catList}>
              {catSearch ? (
                <div class="home-cats-search">
                  <SearchEntry id="cat-search" value={catQuery} placeholder={t("homeSearchCategories")}
                    entryTitle={t("homeSearchCategories")} entryHint="" results=".home-cats-list"
                    onDone={(v) => setCatQuery(v)} />
                </div>
              ) : null}
              {catShown.map((g) => {
                const i = groupItems.indexOf(g);
                const counting = countdown > 0 && catFocus === g.key;
                return (
                  <Fragment key={g.key}>
                    {i === firstGroup && catQuery.trim() === "" ? <div class="home-cats-head" key="__groups__">{t("homeGroups").toUpperCase()}</div> : null}
                    <button class={`st-focusable home-cat${g.key === group ? " sel" : ""}`} data-focus={`g:${g.key}`}
                      aria-pressed={g.key === group} onClick={() => pickCategory(g.key)}>
                      <GroupIcon id={g.key} size={28} />
                      <span class="home-cat-name">{g.label}</span>
                      {counting ? <Countdown n={countdown} /> : <span class="home-cat-count">{g.count.toLocaleString(document.documentElement.lang || undefined)}</span>}
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </aside>
      )}

      <Presence show={menu === "sort"}>
        {(out) => (
          <Menu title={t("homeSortTitle")} subtitle={t("homeSortApplies")} width={560} onClose={closeMenu} closing={out} className="home-menu">
            {SORTS.map((s) => (
              <MenuItem key={s} id={`sort-${s}`} icon="sort" text={t(SORT_TEXT[s].name)} value={s === sort ? undefined : t(SORT_TEXT[s].hint)}
                checked={s === sort} onClick={() => { setSort(s); closeMenu(); }} />
            ))}
            <FocusOnOpen id={`sort-${sort}`} />
          </Menu>
        )}
      </Presence>
      <Presence show={menu === "more"}>
        {(out) => (
          <Menu title={t("homeMoreTitle")} width={760} onClose={closeMenu} closing={out} className="home-menu">
            {PICKS.map((x) => (
              <MenuItem key={x.id} id={`pick-${x.id}`} lead={<LiveDot />} text={t("homePickNow", { what: t(x.label) })}
                onClick={() => setMenu(x.id)} />
            ))}
            {p.adultLocked !== null && p.adultLocked !== undefined ? (
              <MenuItem id="more-adult" lead={<SIcon name="EYE_OFF" size={28} />}
                text={t(p.adultLocked ? "sa_live_adult_open" : "sa_live_adult_close")}
                value={p.adultLocked ? t("sa_live_adult_open_hint") : undefined}
                onClick={() => { setMenu(null); setTimeout(() => { focusFirst(document, menuFrom); p.onAdult?.(); }, 0); }} />
            ) : null}
            <FocusOnOpen id="pick-sport" />
          </Menu>
        )}
      </Presence>
      <Presence show={menu !== null && menu !== "sort" && menu !== "more"}>
        {(out) => {
          const pick = PICKS.find((x) => x.id === menu);
          return (
            <Menu title={t("homePickNow", { what: pick ? t(pick.label) : "" })} subtitle={t("homePickHint")} width={760} onClose={closeMenu} closing={out} className="home-menu">
              {picks.length === 0 ? <MenuItem id="pick-none" text={t("homeNoChannelsHere")} disabled /> : picks.map((x) => (
                <MenuItem key={x.c.id} id={`pickc-${x.c.id}`} lead={<LiveDot />} text={x.c.name} value={x.title}
                  onClick={() => { setMenu(null); p.onOpen(x.c, p.channels); }} />
              ))}
              <FocusOnOpen />
            </Menu>
          );
        }}
      </Presence>
    </div>
  );
}

/** Puts the focus into a menu that has just opened: on [id], else its first row. */
function FocusOnOpen({ id }: { id?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const box = ref.current?.closest(".st-menu");
    if (box) focusFirst(box, id && box.querySelector(`[data-focus="${id}"]`) ? id : undefined);
  }, []);
  return <span ref={ref} hidden />;
}

/** The LIVE_DOT glyph of the "On now" rows: a dot inside a ring. */
function LiveDot() {
  return (
    <svg class="st-icon" viewBox="0 0 24 24" width={28} height={28} fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="4" /><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z" />
    </svg>
  );
}

/** The countdown before a category opens by itself (ui/components/CountdownRing.kt): a blue ring filling, the number in it. */
function Countdown({ n }: { n: number }) {
  return (
    <span class="home-countdown" aria-hidden="true">
      <svg viewBox="0 0 30 30" width={30} height={30}>
        <circle cx="15" cy="15" r="13.75" fill="none" stroke="rgba(0,134,252,.2)" stroke-width="2.5" />
        <circle class="home-countdown-arc" cx="15" cy="15" r="13.75" fill="none" stroke="#0086fc" stroke-width="2.5" stroke-linecap="round" transform="rotate(-90 15 15)" />
      </svg>
      <b>{n}</b>
    </span>
  );
}

/** Channel rows standing in while the playlist loads (LiveStage.kt ChannelListSkeleton, still on a weak TV). */
function ListSkeleton() {
  return (
    <div class="home-skel" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div class="home-skel-row" key={i}>
          <i style={{ width: "40px", height: "16px", borderRadius: "8px" }} />
          <i style={{ width: "76px", height: "54px", borderRadius: "12px" }} />
          <span>
            <i style={{ width: "220px", height: "18px", borderRadius: "9px" }} />
            <i style={{ width: "300px", height: "12px", borderRadius: "6px", marginTop: "8px" }} />
          </span>
        </div>
      ))}
    </div>
  );
}
