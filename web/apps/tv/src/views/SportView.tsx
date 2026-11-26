import type { ComponentChildren } from "preact";
import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { focusFirst, Icon, Menu, MenuItem, Progress, useOwnBack, type IconName } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { GuideContext } from "../state/GuideContext";
import {
  applyBoard, BOARD_SORTS, countries as countriesOf, countryOf, GUIDE_SPORTS, preferredCountries, sportOnChannels,
  type BoardSort, type GuideSport, type GuideSportItem,
} from "../state/guideSport";
import { clock } from "../time";
import { SearchField } from "./SearchField";
import "./screens.css";

/*
 * Sport, as the Android app's TV-box Sports screen (features/sports/SportsBoard.kt, SportsHubScreen.kt `simple`): the
 * sport on the user's channels now, from the guide. The title and its count, the search field with the country and
 * order menus, the sports as equal buttons (the long tail under "More"), then every programme in two columns.
 * OK plays the first channel showing it, the others are the zap list.
 */

/** Sports shown as buttons in the line, the "More" menu holding the rest. */
const ROW_SPORTS = 7;
/** The board waits this long before it says there is nothing (Android `SKELETON_MS`). */
const SETTLE_MS = 3_000;
const COUNT_MS = 500;
const REFRESH_MS = 5 * 60_000;

const SPORT_LABEL: Record<GuideSport, Key> = {
  FOOTBALL: "gssSportFootball", HANDBALL: "gssSportHandball", BASKETBALL: "gssSportBasketball", TENNIS: "gssSportTennis",
  ICE_HOCKEY: "gssSportHockey", MOTORSPORT: "gssSportMotorsport", DARTS: "gssSportDarts", SNOOKER: "gssSportSnooker",
  CYCLING: "gssSportCycling", CRICKET: "gssSportCricket", COMBAT: "gssSportCombat", AMERICAN_FOOTBALL: "gssSportAmericanFootball",
  BASEBALL: "gssSportBaseball", GOLF: "gssSportGolf", RUGBY: "gssSportRugby", VOLLEYBALL: "gssSportVolleyball",
  ATHLETICS: "gssSportAthletics", WINTER: "gssSportWinter", OTHER: "gssSportOther",
};
const SORT_LABEL: Record<BoardSort, Key> = { RELEVANCE: "gssSortRelevance", TIME: "gssSortTime", TITLE: "gssSortTitle", CHANNEL: "gssSortChannel" };

// The query and the order outlive the screen (Android `rememberSaveable`); the sport and country filters do not.
let savedQuery = "";
let savedSort: BoardSort = "RELEVANCE";
/** The card a channel was opened from: focus returns to it when the player closes. */
let lastKey: string | null = null;

interface Props {
  channels: Channel[];
  favorites: ReadonlySet<string>;
  onOpen: (c: Channel, list: readonly Channel[]) => void;
  onFav: (c: Channel) => void;
}

const cardKey = (it: GuideSportItem) => `${it.sport}|${it.title}|${it.start}`;
const sportLabel = (s: GuideSport) => t(SPORT_LABEL[s]);
const appLanguage = () => (typeof document !== "undefined" && document.documentElement.lang) || "en";

/** A country's name in the app's language; the code itself where the TV cannot name it (no Intl.DisplayNames before Chromium 81). */
function countryName(code: string): string {
  const I = Intl as unknown as { DisplayNames?: new (l: string[], o: { type: string }) => { of: (c: string) => string | undefined } };
  try { return (I.DisplayNames ? new I.DisplayNames([appLanguage()], { type: "region" }).of(code) : undefined) ?? code; } catch { return code; }
}

export function SportView({ channels, onOpen }: Props) {
  const { data, now } = useContext(GuideContext);
  const bucket = Math.floor(now / REFRESH_MS);
  const items = useMemo(() => sportOnChannels(channels, data, Date.now()), [channels, data, bucket]);
  const [query, setQuery] = useState(savedQuery);
  const [sort, setSort] = useState<BoardSort>(savedSort);
  const [sports, setSports] = useState<ReadonlySet<GuideSport>>(new Set());
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [menu, setMenu] = useState<"countries" | "sort" | "more" | null>(null);
  const [settled, setSettled] = useState(false);
  useEffect(() => { savedQuery = query; }, [query]);
  useEffect(() => { savedSort = sort; }, [sort]);
  useEffect(() => { const id = setTimeout(() => setSettled(true), SETTLE_MS); return () => clearTimeout(id); }, []);

  const preferred = useMemo(() => {
    const region = (typeof navigator !== "undefined" ? navigator.language : "").split(/[-_]/)[1] ?? null;
    return preferredCountries(appLanguage(), region);
  }, []);
  const shown = useMemo(() => applyBoard(items, query, sports, chosen, sort, preferred), [items, query, sports, chosen, sort, preferred]);
  const count = (s: GuideSport) => items.reduce((n, it) => n + (it.sport === s ? 1 : 0), 0);
  // Sports by how many programmes they have, so the long tail goes into the "More" menu, not the row.
  const sportList = useMemo(() => GUIDE_SPORTS.filter((s) => items.some((it) => it.sport === s)).sort((a, b) => count(b) - count(a)), [items]);
  const rowSports = sportList.length > ROW_SPORTS ? sportList.slice(0, ROW_SPORTS - 1) : sportList;
  const moreSports = sportList.filter((s) => rowSports.indexOf(s) < 0);
  const countryList = useMemo(() => countriesOf(items).sort((a, b) => (countryName(a).toLowerCase() < countryName(b).toLowerCase() ? -1 : 1)), [items]);
  const toggle = <T,>(set: ReadonlySet<T>, v: T): ReadonlySet<T> => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  // Entry: the search field (Android: the entry hook), or the card a channel was opened from.
  useEffect(() => {
    const back = lastKey;
    if (back) { lastKey = null; const el = document.querySelector<HTMLElement>(`[data-focus="${cssId(`sp-${back}`)}"]`); if (el) { el.focus(); return; } }
    focusFirst(document, "sp-search");
  }, []);

  const shownCount = useCountUp(shown.length);
  const play = (it: GuideSportItem) => { lastKey = cardKey(it); onOpen(it.channels[0] as Channel, it.channels); };
  const filtered = query.trim() !== "" || sports.size > 0 || chosen.size > 0;

  return (
    <div class="screen sp">
      <div class="sp-head">
        <div class="sp-title">{t("gssSportsTitle")}<span class="sp-count"> {shownCount}</span></div>
        <div class="sp-search">
          <SearchField id="sp-search" value={query} placeholder={t("gssBoardSearch")} title={t("gssSportsTitle")} hint={t("gssBoardSearch")}
            onChange={setQuery} className="sp-field" />
          {countryList.length > 1 ? (
            <Tool id="sp-countries" icon="language" className="sp-countries" onClick={() => setMenu("countries")}
              value={chosen.size === 0 ? t("gssAllCountries") : [...chosen].map(countryName).sort().join(", ")} />
          ) : null}
          <Tool id="sp-sort" icon="sort" value={t(SORT_LABEL[sort])} onClick={() => setMenu("sort")} />
        </div>
        {sportList.length > 1 ? (
          <div class="sp-tabs">
            <Tab id="sp-all" label={t("gssAll")} count={items.length} chosen={sports.size === 0} onClick={() => setSports(new Set())} />
            {rowSports.map((s) => (
              <Tab key={s} id={`sp-${s}`} label={sportLabel(s)} count={count(s)} chosen={sports.has(s)} onClick={() => setSports(toggle(sports, s))} />
            ))}
            {moreSports.length > 0 ? (
              <Tab id="sp-more" label={t("gssMore")} count={moreSports.reduce((n, s) => n + count(s), 0)} chosen={moreSports.some((s) => sports.has(s))}
                onClick={() => setMenu("more")} />
            ) : null}
          </div>
        ) : null}
      </div>
      <div class="sp-grid">
        {shown.length === 0 ? (
          <div class="sp-empty">{t(!settled ? "gssLooking" : filtered ? "gssNothingFiltered" : "gssSportsEmpty")}</div>
        ) : shown.map((it) => <Card key={cardKey(it)} item={it} now={now} onClick={() => play(it)} />)}
      </div>

      {menu === "countries" ? (
        <BoardMenu title={t("gssCountryTitle")} width={640} first="spm-all" onClose={() => setMenu(null)}>
          <MenuItem id="spm-all" text={t("gssAllCountries")} checked={chosen.size === 0} onClick={() => setChosen(new Set())} />
          {countryList.map((c) => (
            <MenuItem key={c} id={`spm-${c}`} text={countryName(c)} checked={chosen.has(c)}
              value={String(items.reduce((n, it) => n + (countryOf(it) === c ? 1 : 0), 0))} onClick={() => setChosen(toggle(chosen, c))} />
          ))}
        </BoardMenu>
      ) : null}
      {menu === "sort" ? (
        <BoardMenu title={t("gssSortMenuTitle")} width={560} first={`spm-${sort}`} onClose={() => setMenu(null)}>
          {BOARD_SORTS.map((s) => (
            <MenuItem key={s} id={`spm-${s}`} icon="sort" text={t(SORT_LABEL[s])} checked={s === sort} onClick={() => { setSort(s); closeTo(setMenu, "sp-sort"); }} />
          ))}
        </BoardMenu>
      ) : null}
      {menu === "more" ? (
        <BoardMenu title={t("gssMore")} width={560} first={`spm-${moreSports[0] ?? ""}`} onClose={() => setMenu(null)}>
          {moreSports.map((s) => (
            <MenuItem key={s} id={`spm-${s}`} text={sportLabel(s)} checked={sports.has(s)} value={String(count(s))} onClick={() => setSports(toggle(sports, s))} />
          ))}
        </BoardMenu>
      ) : null}
    </div>
  );
}

const cssId = (s: string) => s.replace(/["\\]/g, "\\$&");
const closeTo = (setMenu: (m: null) => void, id: string) => { setMenu(null); setTimeout(() => focusFirst(document, id), 60); };

/** "Sport 37" counts up or down to the new number over half a second (none with animations off). */
function useCountUp(target: number): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target || document.documentElement.dataset.motion === "off") { from.current = target; setShown(target); return; }
    const t0 = performance.now();
    let frame = 0;
    const step = (ts: number) => {
      const k = Math.min(1, (ts - t0) / COUNT_MS);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(start + (target - start) * eased);
      from.current = v;
      setShown(v);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

/** A boxed `StageTool` with a value and ▾. */
function Tool(p: { id: string; icon: IconName; value: string; onClick: () => void; className?: string }) {
  return (
    <button class={`st-focusable st-tool boxed sp-tool${p.className ? ` ${p.className}` : ""}`} data-focus={p.id} onClick={p.onClick}>
      <Icon name={p.icon} size={20} />
      <span class="st-tool-value">{p.value}</span>
      <span class="sp-down"><Icon name="chevron" size={20} /></span>
    </button>
  );
}

/** `StageTab(centered)`: an outlined button, the chosen one outlined in the accent; label and count side by side. */
function Tab(p: { id: string; label: string; count: number; chosen: boolean; onClick: () => void }) {
  return (
    <button class={`st-focusable sp-tab${p.chosen ? " on" : ""}`} data-focus={p.id} aria-pressed={p.chosen} onClick={p.onClick}>
      <span class="sp-tab-l">{p.label}</span>
      <span class="sp-tab-n">{p.count}</span>
    </button>
  );
}

/** One programme: the first channel's logo, "Handball · Kiel – Magdeburg", the channel and times, how far it is. */
function Card({ item, now, onClick }: { item: GuideSportItem; now: number; onClick: () => void }) {
  const ch = item.channels[0] as Channel;
  const { data } = useContext(GuideContext);
  const [broken, setBroken] = useState(false);
  const logo = ch.logo ?? data.logoOf(ch.id);
  const more = item.channels.length > 1 ? ` +${item.channels.length - 1}` : "";
  const span = Math.max(1, item.stop - item.start);
  return (
    <button class="st-focusable sp-card" data-focus={`sp-${cardKey(item)}`} onClick={onClick}>
      <span class="sp-logo">{logo && !broken ? <img src={logo} alt="" decoding="async" onError={() => setBroken(true)} /> : <Icon name="live_tv" size={26} />}</span>
      <span class="sp-body">
        <span class="sp-l1">{sportLabel(item.sport)} · {item.title}</span>
        <span class="sp-l2">{ch.name}{more} · {t("gssTimeRange", { a: clock(item.start), b: clock(item.stop) })}</span>
        <Progress flat value={(now - item.start) / span} />
      </span>
    </button>
  );
}

/** The board's menus (`GuideMenuHost`, TV-box: centred). Back closes them. */
function BoardMenu(p: { title: string; width: number; first: string; onClose: () => void; children: ComponentChildren }) {
  const wrap = useRef<HTMLDivElement>(null);
  useOwnBack(wrap, p.onClose);
  useEffect(() => { focusFirst(wrap.current ?? document, p.first); if (!wrap.current?.contains(document.activeElement)) focusFirst(wrap.current ?? document); }, []);
  return <div ref={wrap}><Menu width={p.width} title={p.title} onClose={p.onClose} returnFocus>{p.children}</Menu></div>;
}
