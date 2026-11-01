import { useEffect, useMemo, useState } from "preact/hooks";
import { canResume, isWatched, seasonsOf, type Episode, type Movie, type Show } from "@skmate/core";
import { focusFirst } from "@skmate/ui";
import { t } from "../i18n";
import type { VodSource } from "../state/library";
import type { Progress } from "../state/progress";
import { clockOf } from "./VodPlayer";
import { Poster } from "./VodView";

export const episodeLabel = (e: Episode): string => t("vodSE", { s: e.season, e: e.episode });
const seasonName = (s: number): string => (s === 0 ? t("vodSpecials") : t("vodSeason", { n: s }));

/**
 * A film's or a show's card, as on Android: poster, year, rating, plot; Play, or Resume and Start over when it was
 * left part way. A show lists its seasons and episodes, each marked watched or with how far it got.
 */
export function VodDetails(p: {
  item: Movie | Show;
  kind: "movie" | "series";
  source: VodSource;
  progressOf: (id: string) => Progress | undefined;
  onPlayMovie: (m: Movie, startMs: number) => void;
  onPlayEpisode: (show: Show, episodes: Episode[], e: Episode, startMs: number) => void;
  onClose: () => void;
}) {
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  useEffect(() => {
    if (p.kind !== "series") return;
    p.source.episodes(p.item as Show).then(
      (list) => { setEpisodes(list); setSeason(seasonsOf(list)[0] ?? null); },
      (e: unknown) => { setEpisodes([]); setFailed(String(e instanceof Error ? e.message : e)); },
    );
  }, [p.item.id]);
  useEffect(() => { focusFirst(document, "vd-play"); }, [p.item.id, episodes === null]);

  const seasons = useMemo(() => (episodes ? seasonsOf(episodes) : []), [episodes]);
  const inSeason = useMemo(() => (episodes ?? []).filter((e) => e.season === season), [episodes, season]);
  // Where Play goes in a show: the first episode not watched to the end (Android's watching order).
  const nextUp = useMemo(() => (episodes ?? []).find((e) => { const g = p.progressOf(e.id); return !g || !isWatched(g.positionMs, g.durationMs); }) ?? episodes?.[0], [episodes]);

  const movie = p.kind === "movie" ? (p.item as Movie) : null;
  const left = movie ? p.progressOf(movie.id) : nextUp ? p.progressOf(nextUp.id) : undefined;
  const resumable = left && canResume(left.positionMs, left.durationMs) ? left : undefined;
  const play = (fromMs: number) => {
    if (movie) p.onPlayMovie(movie, fromMs);
    else if (nextUp && episodes) p.onPlayEpisode(p.item as Show, episodes, nextUp, fromMs);
  };
  const meta = [p.item.year, p.item.rating ? t("vodRating", { r: p.item.rating.toFixed(1) }) : null].filter(Boolean).join(" · ");

  return (
    <div class="scrim" data-modal onClick={p.onClose}>
      <div class="dialog vod-details" role="dialog" aria-label={p.item.name} onClick={(e) => e.stopPropagation()}>
        <div class="vd-poster"><Poster src={p.item.poster} name={p.item.name} /></div>
        <div class="vd-body">
          <div class="vd-title">{p.item.name}</div>
          {meta ? <div class="vd-meta">{meta}</div> : null}
          {p.item.plot ? <div class="vd-plot">{p.item.plot}</div> : null}
          <div class="vd-actions">
            {movie || nextUp ? (
              resumable ? (
                <>
                  <button class="btn" data-focus="vd-play" onClick={() => play(resumable.positionMs)}>
                    {movie ? t("vodResume") : t("vodResumeEpisode", { name: episodeLabel(nextUp as Episode) })} · {clockOf(resumable.positionMs)}
                  </button>
                  <button class="btn" data-focus="vd-start" onClick={() => play(0)}>{t("vodStartOver")}</button>
                </>
              ) : (
                <button class="btn" data-focus="vd-play" onClick={() => play(0)}>
                  {movie ? t("vodPlay") : t("vodPlayEpisode", { name: episodeLabel(nextUp as Episode) })}
                </button>
              )
            ) : null}
          </div>
          {p.kind === "series" ? (
            episodes === null ? <div class="list-head">{t("playlistLoading")}</div>
            : failed ? <div class="status error">{t("vodEpisodesFailed", { error: failed })}</div>
            : episodes.length === 0 ? <div class="list-head">{t("vodNoEpisodes")}</div>
            : (
              <>
                <div class="filters vd-seasons">
                  {seasons.map((s) => (
                    <button class="filter" key={s} data-focus={`vd-season-${s}`} aria-pressed={season === s} onClick={() => setSeason(s)}>{seasonName(s)}</button>
                  ))}
                </div>
                <div class="vd-episodes">
                  {inSeason.map((e) => {
                    const g = p.progressOf(e.id);
                    const done = g ? isWatched(g.positionMs, g.durationMs) : false;
                    return (
                      <button class="row vd-episode" key={e.id} data-focus={`vd-ep-${e.id}`}
                        onClick={() => p.onPlayEpisode(p.item as Show, episodes, e, g && canResume(g.positionMs, g.durationMs) ? g.positionMs : 0)}>
                        <span class="grow">{episodeLabel(e)}{e.title ? `  ${e.title}` : ""}</span>
                        {done ? <span class="sub">{t("vodWatched")}</span>
                          : g && g.durationMs > 0 ? <span class="vd-ep-bar"><span style={{ width: `${Math.round((g.positionMs / g.durationMs) * 100)}%` }} /></span> : null}
                      </button>
                    );
                  })}
                </div>
              </>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
