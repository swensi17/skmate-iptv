import { hasArchive } from "@skmate/core";
import { LoadingState } from "./Spinner";
import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { memo } from "preact/compat";
import { SearchIndex, type Channel, type Movie, type Show } from "@skmate/core";
import type { GuideData, Programme } from "@skmate/epg";
import { focusFirst, Icon, isBack, logoGate, Progress } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { GuideContext } from "../state/GuideContext";
import type { VodSource } from "../state/library";
import { programmeAt } from "../state/guideGrid";
import { ProgrammeSearch, type ProgrammeHit } from "../state/programmeSearch";
import { loadQueries, pushQuery, saveQueries } from "../state/recentQueries";
import type { Settings } from "../state/settings";
import { capitalize } from "../text";
import { clock } from "../time";
import { leftLabel } from "./Left";
import { PreviewVideo } from "./PreviewPane";
import { SearchField } from "./SearchField";
import "./screens.css";

/*
 * Search as the Android app's TV-box Search screen (features/search/SearchScreen.kt): before anything is typed, a
 * rolling caption over the field in the middle of the screen and the recent searches under it; with two letters or
 * more, the field rises to the top left, "Search 55" above it, the kind buttons (Live TV, TV shows, Movies, Series)
 * under it, the grouped results below, and on the right the focused result: its channel's preview, or the film.
 * OK goes to the item: a channel or a programme plays the channel, a film or a series opens its card.
 * Back clears the search first, then leaves.
 */

type Kind = "live" | "tv" | "movies" | "series";
const KINDS: Kind[] = ["live", "tv", "movies", "series"];
const KIND_LABEL: Record<Kind, Key> = { live: "gssLiveTv", tv: "gssOnTv", movies: "gssMovies", series: "gssSeries" };
const CAPTIONS: Key[] = ["gssCaptionChannels", "gssCaptionPrograms", "gssCaptionGuide", "gssCaptionMovies", "gssCaptionSeries", "gssCaptionLayout"];

/** Stage 1728 wide: `fx(n)` = n of 1920. */
const fx = (n: number) => (1728 * n) / 1920;
const LIST_X = fx(64);
const LIST_W = fx(846);
const CENTRED_X = (1728 - LIST_W) / 2;
const LAUNCHER_TOP = 404;
const RESULTS_TOP = 118;
/** The query runs this long after the last key, and needs two letters (SearchViewModel: debounce 250). */
const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;
const ALL_TAB_CHANNELS = 4;
const RECENT_SHOWN = 8;
const CAPTION_HOLD_MS = 2400;
const CAPTION_ROLL_MS = 420;
const PREVIEW_DELAY_MS = 700;
/** Rows are drawn in pages: the list grows as the cursor nears its end (a TV draws a few dozen rows, not hundreds). */
const PAGE = 40;

type Entry =
  | { k: "head"; key: string; text: string }
  | { k: "ch"; key: string; channel: Channel }
  | { k: "pr"; key: string; hit: ProgrammeHit }
  | { k: "mv"; key: string; movie: Movie }
  | { k: "se"; key: string; show: Show }
  | { k: "all"; key: string; count: number };

interface Props {
  channels: Channel[];
  favorites: ReadonlySet<string>;
  onOpen: (c: Channel, list: readonly Channel[]) => void;
  onArchive: (c: Channel, p: Programme, list: readonly Channel[]) => void;
  onUpcoming: (c: Channel, p: Programme, list: readonly Channel[]) => void;
  reminded: (c: Channel, p: Programme) => boolean;
  onFav: (c: Channel) => void;
  /** Films and series of the playlist, searched too when given. */
  vod?: VodSource | null;
  onOpenVod?: (item: Movie | Show, kind: "movie" | "series") => void;
  settings?: Settings;
}

// The search outlives the screen while the app runs (Android keeps it in its view model): back from a channel, the
// results and the row are still there.
let saved = { query: "", kinds: [] as Kind[], lastKey: null as string | null };
const vodCache = new WeakMap<VodSource, Promise<{ movies: Movie[]; shows: Show[] }>>();

export function SearchView({ channels, onOpen, vod, onOpenVod, settings }: Props) {
  const { data, now } = useContext(GuideContext);
  const [query, setQuery] = useState(saved.query);
  const [settled, setSettled] = useState(saved.query);
  const [kinds, setKinds] = useState<ReadonlySet<Kind>>(new Set(saved.kinds));
  const [recent, setRecent] = useState<string[]>(loadQueries);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [listFocused, setListFocused] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [library, setLibrary] = useState<{ movies: Movie[]; shows: Show[] } | null>(null);
  const [vodBusy, setVodBusy] = useState(false);
  useEffect(() => { const id = setTimeout(() => setSettled(query), DEBOUNCE_MS); return () => clearTimeout(id); }, [query]);
  useEffect(() => { saved = { ...saved, query: settled, kinds: [...kinds] }; }, [settled, kinds]);

  const q = settled.trim();
  const searching = q.length >= MIN_CHARS;

  // Films and series are fetched once, the first time something is searched.
  useEffect(() => {
    if (!searching || !vod || library) return;
    let live = true;
    let job = vodCache.get(vod);
    if (!job) {
      job = Promise.all([vod.movies(null).catch(() => [] as Movie[]), vod.shows(null).catch(() => [] as Show[])]).then(([movies, shows]) => ({ movies, shows }));
      vodCache.set(vod, job);
    }
    setVodBusy(true);
    job.then((lib) => { if (live) { setLibrary(lib); setVodBusy(false); } }, () => { if (live) setVodBusy(false); });
    return () => { live = false; };
  }, [searching, vod]);

  const channelIndex = useMemo(() => new SearchIndex(channels, (c) => c.name), [channels]);
  const numberOf = useMemo(() => { const m = new Map<string, number>(); channels.forEach((c, i) => m.set(c.id, i + 1)); return m; }, [channels]);
  const programmes = useMemo(() => new ProgrammeSearch(data, channels, now), [data, channels, Math.floor(now / 60_000)]);
  // The whole stored guide too, not only the hours in memory: a series later in the week or in the archive (#752).
  const [stored, setStored] = useState<{ q: string; hits: ProgrammeHit[] }>({ q: "", hits: [] });
  useEffect(() => {
    if (!searching || q.trim().length < 2) return;
    let live = true;
    const id = setTimeout(() => {
      void data.findStored(q, 300).then((found) => {
        if (!live) return;
        const byId = new Map(channels.map((c) => [c.id, c]));
        const at = Date.now();
        const hits: ProgrammeHit[] = [];
        for (const f of found) {
          const channel = byId.get(f.channelId);
          if (!channel) continue;
          if (f.programme.stop <= at && !hasArchive(channel, f.programme.start, f.programme.stop, at)) continue;
          hits.push({ channel, programme: f.programme, rank: 0, live: f.programme.start <= at && at < f.programme.stop });
        }
        hits.sort((a, b) => Number(b.live) - Number(a.live) || (a.programme.stop > at ? a.programme.start - b.programme.start : b.programme.start - a.programme.start));
        setStored({ q, hits });
      });
    }, 350);
    return () => { live = false; clearTimeout(id); };
  }, [q, searching, data, channels]);
  const movieIndex = useMemo(() => (library ? new SearchIndex(library.movies, (m) => m.name) : null), [library]);
  const showIndex = useMemo(() => (library ? new SearchIndex(library.shows, (s) => s.name) : null), [library]);

  // The answer is worked out in short slices after the spinner has been drawn (a TV needs seconds for one pass over thousands
  // of names): the screen shows the spinner while it runs, then the whole result at once.
  const [answer, setAnswer] = useState<{ q: string; res: typeof NONE } | null>(null);
  useEffect(() => {
    if (!searching) { setAnswer(null); return; }
    let live = true;
    const pause = () => new Promise<void>((r) => { setTimeout(r, 2); });
    const stop = () => !live;
    void (async () => {
      await pause();
      const live_ = await channelIndex.searchSliced(q, pause, { cancelled: stop });
      if (!live_) return;
      const movies = movieIndex ? await movieIndex.searchSliced(q, pause, { cancelled: stop, limit: 200 }) : [];
      if (!movies) return;
      const series = showIndex ? await showIndex.searchSliced(q, pause, { cancelled: stop, limit: 200 }) : [];
      if (!series) return;
      await pause();
      const near = programmes.search(q, now);
      const seen = new Set(near.map((h) => `${h.channel.id}|${h.programme.start}`));
      const tv = near.concat(stored.q === q ? stored.hits.filter((h) => !seen.has(`${h.channel.id}|${h.programme.start}`)) : []);
      if (live) setAnswer({ q, res: { live: live_.map((r) => r.item), tv, movies: movies.map((r) => r.item), series: series.map((r) => r.item) } });
    })();
    return () => { live = false; };
  }, [q, searching, channelIndex, programmes, movieIndex, showIndex, stored]);
  const busy = searching && (answer === null || answer.q !== q);
  const results = answer && answer.q === q ? answer.res : answer ? answer.res : NONE;
  const on = (k: Kind) => kinds.size === 0 || kinds.has(k);
  const shown = {
    live: on("live") ? results.live : [], tv: on("tv") ? results.tv : [],
    movies: on("movies") ? results.movies : [], series: on("series") ? results.series : [],
  };
  const total = shown.live.length + shown.tv.length + shown.movies.length + shown.series.length;

  const entries = useMemo<Entry[]>(() => {
    if (!searching) return [];
    const grouped = kinds.size !== 1;
    const out: Entry[] = [];
    const head = (k: Kind, n: number) => { if (grouped) out.push({ k: "head", key: `h-${k}`, text: `${t(KIND_LABEL[k]).toLocaleUpperCase()} · ${n}` }); };
    if (shown.live.length > 0) {
      head("live", shown.live.length);
      const cap = grouped && shown.live.length > ALL_TAB_CHANNELS;
      (cap ? shown.live.slice(0, ALL_TAB_CHANNELS) : shown.live).forEach((c) => out.push({ k: "ch", key: `c${c.id}`, channel: c }));
      if (cap) out.push({ k: "all", key: "all-channels", count: shown.live.length });
    }
    if (shown.tv.length > 0) { head("tv", shown.tv.length); shown.tv.forEach((h) => out.push({ k: "pr", key: `p${h.channel.id}-${h.programme.start}`, hit: h })); }
    if (shown.movies.length > 0) { head("movies", shown.movies.length); shown.movies.forEach((m) => out.push({ k: "mv", key: `m${m.id}`, movie: m })); }
    if (shown.series.length > 0) { head("series", shown.series.length); shown.series.forEach((s) => out.push({ k: "se", key: `s${s.id}`, show: s })); }
    return out;
  }, [results, kinds, searching]);
  useEffect(() => { setLimit(PAGE); }, [entries]);

  const isResult = (e: Entry) => e.k === "ch" || e.k === "pr" || e.k === "mv" || e.k === "se";
  const active = entries.find((e) => e.key === focusedKey && isResult(e)) ?? entries.find(isResult) ?? null;
  const activeChannel = active?.k === "ch" ? active.channel : active?.k === "pr" ? active.hit.channel : null;
  const playable = useMemo(() => {
    const seen = new Set<string>();
    return [...shown.live, ...shown.tv.map((h) => h.channel)].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  }, [results, kinds]);

  const filterEntry = () => `sr-k-${KINDS.find((k) => kinds.has(k)) ?? "live"}`;
  const remember = () => { const next = pushQuery(recent, q); setRecent(next); saveQueries(next); };
  // The rows are drawn again only when their own entry changed: a step of the cursor must not redraw the whole page (the callbacks below keep one identity).
  const goRef = useRef<(e: Entry) => void>(() => undefined);
  const allRef = useRef<() => void>(() => undefined);
  const openers = useRef(new WeakMap<Entry, () => void>());
  const openerOf = (e: Entry) => { let fn = openers.current.get(e); if (!fn) { fn = () => goRef.current(e); openers.current.set(e, fn); } return fn; };
  const onAll = useRef(() => allRef.current()).current;
  const goTo = (e: Entry) => {
    saved.lastKey = e.key;
    remember();
    if (e.k === "ch") onOpen(e.channel, playable);
    else if (e.k === "pr") onOpen(e.hit.channel, playable);
    else if (e.k === "mv") onOpenVod?.(e.movie, "movie");
    else if (e.k === "se") onOpenVod?.(e.show, "series");
  };

  // On open: the row left from (back from a channel or a film), else the field.
  useEffect(() => {
    const back = saved.lastKey;
    saved.lastKey = null;
    const el = back ? Array.from(document.querySelectorAll<HTMLElement>("[data-focus]")).find((x) => x.dataset.focus === `sr-${back}`) : undefined;
    if (el) el.focus(); else focusFirst(document, "sr-field");
  }, []);

  // Back clears an active search (and goes back to the field) before it leaves the screen.
  const state = useRef({ query });
  state.current = { query };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isBack(e) || state.current.query.trim() === "" || document.querySelector("[data-modal]")) return;
      if (document.activeElement instanceof HTMLInputElement) return;
      e.preventDefault(); e.stopImmediatePropagation();
      setQuery(""); setSettled(""); setKinds(new Set());
      setTimeout(() => focusFirst(document, "sr-field"), 0);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  // ▼ from the field: the first kind button that is on (searching), or the first recent search.
  const onFieldKey = (e: KeyboardEvent) => {
    if (!(e.key === "ArrowDown" || e.keyCode === 40)) return;
    const target = searching ? filterEntry() : recent.length > 0 ? "sr-recent-0" : null;
    if (!target) return;
    e.preventDefault(); e.stopPropagation();
    focusFirst(document, target);
  };
  // ▲ out of the results: the first kind button that is on, not the one nearest the row.
  const onListKey = (e: KeyboardEvent) => {
    logoGate.busy(); // the list is moving: no picture starts loading until it has stood still
    // ▶ on a channel row reaches the schedule under the preview, as on Live TV (SearchScreen.kt:446): only when a next programme exists.
    if ((e.key === "ArrowRight" || e.keyCode === 39) && active?.k === "ch" && (document.activeElement as HTMLElement | null)?.dataset.focus === `sr-${active.key}`) {
      if (data.of(active.channel.id).some((x) => x.start > now)) { e.preventDefault(); e.stopPropagation(); focusFirst(document, "sr-sched-0"); }
      return;
    }
    if (!(e.key === "ArrowUp" || e.keyCode === 38)) return;
    const first = entries.find((x) => x.k !== "head");
    if (!first || (document.activeElement as HTMLElement | null)?.dataset.focus !== `sr-${first.key}`) return;
    e.preventDefault(); e.stopPropagation();
    focusFirst(document, filterEntry());
  };

  // The channel's picture plays only while a channel row has the cursor, 700 ms after it settles there.
  const [playing, setPlaying] = useState<Channel | null>(null);
  const wantPreview = listFocused && activeChannel && (settings?.preview ?? true) ? activeChannel : null;
  useEffect(() => {
    setPlaying(null);
    if (!wantPreview) return;
    const id = setTimeout(() => setPlaying(wantPreview), PREVIEW_DELAY_MS);
    return () => clearTimeout(id);
  }, [wantPreview?.id]);

  goRef.current = goTo;
  allRef.current = () => { setKinds(new Set<Kind>(["live"])); const c = shown.live[0]; if (c) setTimeout(() => focusFirst(document, `sr-c${c.id}`), 0); };
  const shownEntries = entries.slice(0, limit);
  const recentLogo = (term: string) => { const c = channelIndex.search(term, 1)[0]?.item; return c ? c.logo ?? data.logoOf(c.id) : undefined; };

  return (
    <div class={`screen sr${searching ? " results" : ""}`}>
      {searching ? (
        <div class="sr-head"><span>{t("gssSearchTitle")}</span><span class="sr-count">{total}</span></div>
      ) : <Caption />}
      <div class="sr-field">
        <SearchField id="sr-field" value={query} placeholder={t("gssFieldHint")} title={t("gssSearchTitle")} hint={t("gssFieldHint")}
          onChange={setQuery} onDone={(v) => { setSettled(v); }} onKeyDown={onFieldKey} />
      </div>

      {!searching ? (
        recent.length > 0 ? (
          <div class="sr-recent">
            <div class="sr-group">{t("gssRecent").toLocaleUpperCase()}</div>
            {recent.slice(0, RECENT_SHOWN).map((term, i) => {
              const logo = recentLogo(term);
              return (
                <button key={term} class="st-focusable sr-rq" data-focus={`sr-recent-${i}`} onClick={() => { setQuery(term); setSettled(term); }}>
                  <span class="sr-rq-plate">{logo ? <img src={logo} alt="" decoding="async" /> : <Icon name="history" size={20} />}</span>
                  <span class="sr-rq-t">{term}</span>
                </button>
              );
            })}
            <button class="st-focusable st-tool sr-clear" data-focus="sr-clear" onClick={() => { setRecent([]); saveQueries([]); focusFirst(document, "sr-field"); }}>
              <Icon name="trash" size={20} /><span>{t("gssClearRecent")}</span>
            </button>
          </div>
        ) : null
      ) : (
        <>
          <div class="sr-kinds">
            {KINDS.map((k) => {
              const label = t(KIND_LABEL[k]);
              const n = String(results[k].length);
              return (
                <button key={k} class={`st-focusable sp-tab${kinds.has(k) ? " on" : ""}`} data-focus={`sr-k-${k}`} aria-pressed={kinds.has(k)}
                  style={{ flexGrow: String(label.length + n.length + 4) }}
                  onClick={() => { const next = new Set(kinds); if (next.has(k)) next.delete(k); else next.add(k); setKinds(next); }}>
                  <span class="sp-tab-l">{label}</span><span class="sp-tab-n">{n}</span>
                </button>
              );
            })}
          </div>
          {busy || (total === 0 && vodBusy) ? (
            <LoadingState title={t("gssSearching")} class="sr-loading" />
          ) : total === 0 ? (
            vodBusy ? (
              <LoadingState title={t("gssSearching")} class="sr-loading" />
            ) : (
              <div class="sr-none">
                <div class="sr-none-t">{t("gssNothingFound", { q })}</div>
                <div class="sr-none-b">{t("gssNothingFoundBody")}</div>
              </div>
            )
          ) : (
            <div class="sr-list" onKeyDown={onListKey}
              onFocusIn={(e) => {
                setListFocused(true);
                const id = (e.target as HTMLElement).dataset?.focus ?? "";
                const at = shownEntries.findIndex((x) => `sr-${x.key}` === id);
                if (at >= 0) setFocusedKey(shownEntries[at]?.key ?? null);
                if (at >= limit - 8 && limit < entries.length) setLimit((l) => l + PAGE);
              }}
              onFocusOut={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setListFocused(false); }}
            >
              {shownEntries.map((e, i) => (
                <ResultRow key={e.key} entry={e} first={i === 0} now={now} data={data} numberOf={numberOf}
                  onOpen={openerOf(e)} onAll={onAll} />
              ))}
            </div>
          )}
          {active ? <Panel entry={active} now={now} playing={playing} settings={settings} numberOf={numberOf}
            onOpen={() => goTo(active)} onBack={() => focusFirst(document, `sr-${active.key}`)} /> : null}
        </>
      )}
    </div>
  );
}

/** "Search channels", "Search", …: one phrase at a time, each rolling up out of the last. */
function Caption() {
  const [i, setI] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => setI((n) => { setPrev(n); return (n + 1) % CAPTIONS.length; }), CAPTION_HOLD_MS);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { if (prev === null) return; const id = setTimeout(() => setPrev(null), CAPTION_ROLL_MS); return () => clearTimeout(id); }, [prev]);
  return (
    <div class="sr-caption" aria-live="polite">
      {prev !== null ? <span key={`o${prev}`} class="sr-cap out">{t(CAPTIONS[prev] as Key)}</span> : null}
      <span key={`i${i}`} class={`sr-cap${prev !== null ? " in" : ""}`}>{t(CAPTIONS[i] as Key)}</span>
    </div>
  );
}

function Plate({ src, icon }: { src?: string | undefined; icon: "live_tv" | "movies" | "series" }) {
  const [broken, setBroken] = useState(false);
  // A picture starts loading only once the list has stood still (see logoGate); until then the plate's glyph holds the place.
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!src) return;
    const cancel = logoGate.request(src, () => setArmed(src));
    return () => { cancel(); logoGate.done(src, false); };
  }, [src]);
  const ready = !!src && (armed === src || logoGate.isSeen(src));
  return src && ready && !broken
    ? <img src={src} alt="" decoding="async" onLoad={() => logoGate.done(src, true)} onError={() => { logoGate.done(src, false); setBroken(true); }} />
    : <Icon name={icon} size={icon === "live_tv" ? 42 : 22} />;
}

/** A result row (`SearchRow`): 84 high, the plate or poster, the title 21/700 and a 16 px line under it. */
/** No results yet: one object, so the lists below keep their identity between draws. */
const NONE = { live: [] as Channel[], tv: [] as ProgrammeHit[], movies: [] as Movie[], series: [] as Show[] };

const ResultRow = memo(function ResultRow(p: { entry: Entry; first: boolean; now: number; data: GuideData; numberOf: Map<string, number>; onOpen: () => void; onAll: () => void }) {
  const e = p.entry;
  if (e.k === "head") return <div class={`sr-group${p.first ? " first" : ""}`}>{e.text}</div>;
  if (e.k === "all") {
    return (
      <button class="st-focusable st-tool sr-all" data-focus={`sr-${e.key}`} onClick={p.onAll}>
        <Icon name="list" size={20} /><span>{t("gssAllChannels", { n: e.count })}</span>
      </button>
    );
  }
  let title = "";
  let line = "";
  let lead = null;
  if (e.k === "ch") {
    const c = e.channel;
    const nowOn = programmeAt(p.data.of(c.id), p.now);
    title = c.name;
    line = [c.group ? capitalize(c.group) : null, String(p.numberOf.get(c.id) ?? ""), nowOn && p.now < nowOn.stop ? nowOn.title : null].filter((x) => !!x).join(" · ");
    lead = <span class="sr-plate"><Plate src={c.logo ?? p.data.logoOf(c.id)} icon="live_tv" /></span>;
  } else if (e.k === "pr") {
    const { channel: c, programme: pr } = e.hit;
    title = pr.title;
    line = `${c.name} · ${t("gssTimeRange", { a: clock(pr.start), b: clock(pr.stop) })}`;
    lead = <span class="sr-plate"><Plate src={c.logo ?? p.data.logoOf(c.id)} icon="live_tv" /></span>;
  } else {
    const item = e.k === "mv" ? e.movie : e.show;
    title = item.name;
    line = [item.year ? String(item.year) : null, item.rating && item.rating > 0 ? `★ ${item.rating.toFixed(1)}` : null].filter((x) => !!x).join(" · ");
    lead = <span class="sr-poster"><Plate src={item.poster} icon={e.k === "mv" ? "movies" : "series"} /></span>;
  }
  return (
    <button class="st-focusable sr-row" data-focus={`sr-${e.key}`} onClick={p.onOpen}>
      {lead}
      <span class="sr-row-b"><span class="sr-row-t">{title}</span><span class="sr-row-l">{line}</span></span>
    </button>
  );
});

/** The right side: Live TV's preview pane for a channel (picture, what is on, how far), the poster panel for a film. */
function Panel(p: { entry: Entry; now: number; playing: Channel | null; settings?: Settings | undefined; numberOf: Map<string, number>; onOpen: () => void; onBack: () => void }) {
  const { data } = useContext(GuideContext);
  const e = p.entry;
  if (e.k === "ch" || e.k === "pr") {
    const c = e.k === "ch" ? e.channel : e.hit.channel;
    const pr = e.k === "pr" ? e.hit.programme : programmeAt(data.of(c.id), p.now);
    const live = pr !== null && pr.start <= p.now && p.now < pr.stop;
    return (
      <aside class="sr-panel">
        <div class="sr-frame">
          <span class="sr-frame-logo"><Plate src={c.logo ?? data.logoOf(c.id)} icon="live_tv" /></span>
          {p.playing && p.playing.id === c.id && p.settings ? <PreviewVideo key={p.playing.url} channel={p.playing} settings={p.settings} /> : null}
          <span class="sr-shade" />
          <div class="sr-chan">
            <span class="sr-chan-plate"><Plate src={c.logo ?? data.logoOf(c.id)} icon="live_tv" /></span>
            <span class="sr-chan-t"><span class="sr-chan-n">{p.numberOf.get(c.id) ?? ""}</span><span class="sr-chan-name">{c.name}</span></span>
          </div>
        </div>
        {pr ? (
          <div class="sr-info">
            <div class="sr-info-t">{pr.title}</div>
            <div class="sr-info-d">{t("gssTimeRange", { a: clock(pr.start), b: clock(pr.stop) })}</div>
            {live ? (
              <div class="sr-info-p"><Progress value={(p.now - pr.start) / Math.max(1, pr.stop - pr.start)} /><span>{leftLabel(pr.stop, p.now)}</span></div>
            ) : null}
            {pr.desc ? <div class="sr-info-s">{pr.desc}</div> : null}
          </div>
        ) : null}
        {e.k === "ch" ? <Schedule channel={c} now={p.now} onOpen={p.onOpen} onBack={p.onBack} /> : null}
      </aside>
    );
  }
  if (e.k === "mv" || e.k === "se") {
    const item = e.k === "mv" ? e.movie : e.show;
    return (
      <aside class="sr-panel">
        <div class="sr-frame vod">
          {item.poster ? <img class="sr-poster-big" src={item.poster} alt="" decoding="async" /> : null}
          <span class="sr-shade" />
          <div class="sr-vod-title">{item.name}</div>
        </div>
        <div class="sr-info">
          <div class="sr-info-d">{[item.year ? String(item.year) : null, item.rating && item.rating > 0 ? `★ ${item.rating.toFixed(1)}` : null].filter((x) => !!x).join(" · ")}</div>
          {item.plot ? <div class="sr-info-s vod">{item.plot}</div> : null}
        </div>
      </aside>
    );
  }
  return null;
}

/** Next and later under the preview (LiveStage.kt LiveStagePane): Left goes back to the row, Down stops on the last line; OK on one opens the channel (Search only shows, SearchScreen.kt onOpenProgramme). */
function Schedule(p: { channel: Channel; now: number; onOpen: () => void; onBack: () => void }) {
  const { data } = useContext(GuideContext);
  const upcoming = useMemo(() => data.of(p.channel.id).filter((x) => x.start > p.now).sort((a, b) => a.start - b.start).slice(0, 14), [p.channel.id, data, Math.floor(p.now / 60_000)]);
  if (upcoming.length === 0) return null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.keyCode === 37) { e.preventDefault(); e.stopPropagation(); p.onBack(); return; }
    if (e.key === "ArrowRight" || e.keyCode === 39) { e.preventDefault(); e.stopPropagation(); return; }
    const dir = e.key === "ArrowUp" || e.keyCode === 38 ? -1 : e.key === "ArrowDown" || e.keyCode === 40 ? 1 : 0;
    if (dir === 0) return;
    e.preventDefault(); e.stopPropagation();
    const all = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-focus]"));
    const at = all.indexOf(document.activeElement as HTMLElement);
    all[Math.max(0, Math.min(all.length - 1, at + dir))]?.focus();
  };
  return (
    <div class="hp-sched sr-sched" onKeyDown={onKey as unknown as (e: Event) => void}>
      {upcoming.map((x, i) => (
        <button key={x.start} class={"st-focusable hp-sched-item" + (i === 0 ? " next" : "")} data-focus={"sr-sched-" + i} onClick={p.onOpen}>
          <b>{clock(x.start)}</b>{"  "}{x.title}
        </button>
      ))}
    </div>
  );
}
