import { useEffect, useMemo, useState } from "preact/hooks";
import type { Movie, Show, VodCategory } from "@skmate/core";
import { focusFirst, VirtualList } from "@skmate/ui";
import { t } from "../i18n";
import type { VodKind, VodSource } from "../state/library";
import type { Progress } from "../state/progress";
import { hueOf, monogram } from "../text";

const PER_ROW = 5;
const ROW_H = 430;
const GRID_H = 860;
const TYPING_PAUSE_MS = 180;

type Sort = "provider" | "az" | "added" | "rating";
const SORTS: Array<[Sort, "vodSortProvider" | "vodSortAz" | "vodSortAdded" | "vodSortRating"]> = [
  ["provider", "vodSortProvider"], ["az", "vodSortAz"], ["added", "vodSortAdded"], ["rating", "vodSortRating"],
];
type Item = Movie | Show;

/** A poster, else a coloured card with the title's letters (as a channel without a logo). */
export function Poster({ src, name }: { src?: string; name: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (src && broken !== src) return <img class="poster-img" src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(src)} />;
  return <span class="poster-img badge" style={{ "--h": String(hueOf(name)) }} aria-hidden="true">{monogram(name)}</span>;
}

function sorted(items: Item[], sort: Sort): Item[] {
  if (sort === "provider") return items;
  const list = [...items];
  if (sort === "az") list.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "added") list.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  if (sort === "rating") list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  return list;
}

/**
 * Films or series, as the Android app lays them out: the categories on the left, the posters on the right, a search
 * and the sort above them, "Continue watching" first. OK on a poster opens its card ([onOpen]).
 */
export function VodView(p: {
  kind: VodKind;
  source: VodSource | null;
  continueRow: Progress[];
  onOpen: (item: Item) => void;
  onContinue: (p: Progress) => void;
}) {
  const [cats, setCats] = useState<VodCategory[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("provider");
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  useEffect(() => { const id = setTimeout(() => setSettled(query), TYPING_PAUSE_MS); return () => clearTimeout(id); }, [query]);

  useEffect(() => {
    setCat(null); setCats([]);
    p.source?.categories(p.kind).then(setCats, () => setCats([]));
  }, [p.source, p.kind]);
  useEffect(() => {
    if (!p.source) { setItems([]); return; }
    let live = true;
    setItems(null); setError(null);
    (p.kind === "movie" ? p.source.movies(cat) : p.source.shows(cat)).then(
      (list) => { if (live) setItems(list); },
      (e: unknown) => { if (live) { setItems([]); setError(String(e instanceof Error ? e.message : e)); } },
    );
    return () => { live = false; };
  }, [p.source, p.kind, cat]);
  useEffect(() => { focusFirst(document, "vod-cat-all"); }, [p.kind]);

  const shown = useMemo(() => {
    const q = settled.trim().toLowerCase();
    const list = q ? (items ?? []).filter((i) => i.name.toLowerCase().includes(q)) : items ?? [];
    return sorted(list, sort);
  }, [items, settled, sort]);
  const rows = useMemo(() => {
    const out: Item[][] = [];
    for (let i = 0; i < shown.length; i += PER_ROW) out.push(shown.slice(i, i + PER_ROW));
    return out;
  }, [shown]);
  const resume = cat === null && settled.trim() === "" ? p.continueRow : [];
  const empty = p.kind === "movie"
    ? (settled.trim() ? t("vodNoMoviesFound", { q: settled.trim() }) : t("vodNoMovies"))
    : (settled.trim() ? t("vodNoSeriesFound", { q: settled.trim() }) : t("vodNoSeries"));

  return (
    <div class="screen vod">
      <h2>{t(p.kind === "movie" ? "navMovies" : "navSeries")}</h2>
      <div class="vod-columns">
        <div class="vod-cats" role="list">
          <button class="row vod-cat" data-focus="vod-cat-all" aria-pressed={cat === null} onClick={() => setCat(null)}>
            {t(p.kind === "movie" ? "vodAllMovies" : "vodAllSeries")}
          </button>
          {cats.map((c) => (
            <button class="row vod-cat" key={c.id} data-focus={`vod-cat-${c.id}`} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>
          ))}
        </div>
        <div class="vod-main">
          <div class="toolbar">
            <input class="field small" data-focus="vod-search" value={query} placeholder={t("filterSearch")}
              onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
            {SORTS.map(([s, label]) => (
              <button class="filter" key={s} data-focus={`vod-sort-${s}`} aria-pressed={sort === s} onClick={() => setSort(s)}>{t(label)}</button>
            ))}
          </div>
          {resume.length > 0 ? (
            <div class="vod-continue">
              <div class="setting-title">{t("vodContinue")}</div>
              <div class="vod-strip">
                {resume.map((r) => (
                  <button class="poster wide" key={`${r.itemId}|${r.episodeId ?? ""}`} data-focus={`vod-cont-${r.itemId}`} onClick={() => p.onContinue(r)}>
                    <Poster src={r.poster} name={r.name} />
                    <span class="poster-name">{r.name}{r.episodeLabel ? ` · ${r.episodeLabel}` : ""}</span>
                    <span class="poster-bar"><span style={{ width: `${Math.round((r.positionMs / r.durationMs) * 100)}%` }} /></span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {items === null ? (
            <div class="list-head">{t("playlistLoading")}</div>
          ) : rows.length === 0 ? (
            <div class="list-head">{error ? t("playlistErrNetwork") : empty}</div>
          ) : (
            <VirtualList
              key={`${p.kind}|${cat}|${settled}|${sort}`} items={rows} rowHeight={ROW_H} height={resume.length > 0 ? GRID_H - 330 : GRID_H} pageSize={2}
              idOf={(r) => `vod-row-${r[0]?.id ?? ""}`}
              renderRow={(r) => (
                <div class="poster-row">
                  {r.map((it) => (
                    <button class="poster" key={it.id} data-focus={`vod-${it.id}`} onClick={() => p.onOpen(it)}>
                      <Poster src={it.poster} name={it.name} />
                      <span class="poster-name">{it.name}</span>
                      <span class="poster-meta">{[it.year, it.rating ? t("vodRating", { r: it.rating.toFixed(1) }) : null].filter(Boolean).join(" · ")}</span>
                    </button>
                  ))}
                </div>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
