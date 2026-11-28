import { t } from "../i18n";
import { useEffect, useState } from "preact/hooks";
import { largePosterUrl, type ProgrammeArt } from "../state/tmdb";

/*
 * A programme's TMDB poster (Android ProgrammeArtView.kt): small in the lists and the info, fading in as it loads
 * (2.5.4), and over the whole screen from OK on it in the channel panel.
 */

/** "2008 · What it is about": the year and the description, as the info and the panel show them. */
export function aboutText(a: ProgrammeArt): string {
  return [a.year != null ? String(a.year) : null, a.overview].filter((x): x is string => !!x).join(" · ");
}

/** Posters already drawn in this run: shown at once, without the fade (2.5.4). */
const drawn = new Set<string>();

/**
 * The poster, [width] wide at the poster's own 2:3, softly rounded on a faint plate. It fades in when it arrives;
 * one already drawn in this run is there at once.
 */
export function ProgrammePoster({ url, width, class: cls }: { url: string; width: number; class?: string }) {
  const [loaded, setLoaded] = useState<string | null>(() => (drawn.has(url) ? url : null));
  return (
    <span class={`pa-poster${cls ? ` ${cls}` : ""}`} style={{ width: `${width}px`, height: `${Math.round(width * 1.5)}px` }}>
      <img
        key={url} src={url} alt="" decoding="async" class={loaded === url ? "in" : undefined}
        onLoad={() => { if (drawn.size > 300) drawn.clear(); drawn.add(url); setLoaded(url); }}
      />
    </span>
  );
}

/**
 * The poster over the whole screen, centred and 86 % of the screen high: the small one already shown appears at once
 * and the large one draws over it when it arrives, so opening never waits. A short fade and grow (transform and
 * opacity only). OK or Back closes it; the owner routes those keys (nothing behind it moves while it is open).
 */
export function PosterViewer({ art, closing }: { art: ProgrammeArt; closing?: boolean }) {
  const [big, setBig] = useState(false);
  useEffect(() => { setBig(false); }, [art.posterUrl]);
  return (
    <div class={`pa-viewer${closing ? " out" : ""}`} data-modal role="dialog" aria-label={art.title}>
      <div class="pa-viewer-frame">
        <img src={art.posterUrl} alt="" decoding="async" />
        <img src={largePosterUrl(art)} alt={art.title} decoding="async" class={big ? "in" : undefined} onLoad={() => setBig(true)} />
      </div>
    </div>
  );
}

/**
 * A description around a poster, as in a magazine (Android aroundPoster): the text runs right of the poster down to
 * its bottom, then under it the full width, to the end. No line limit, justified, long words hyphenated. A float,
 * not a measure: old TV browsers (Chromium 53) lay it out the same way.
 */
export function AroundPoster({ text, posterUrl, width = 130, class: cls }: { text: string; posterUrl?: string | null; width?: number; class?: string }) {
  const lang = (typeof document !== "undefined" && document.documentElement.lang) || "ru";
  const { rest, ratings } = splitRatings(text);
  return (
    <div class={`around${cls ? ` ${cls}` : ""}`} lang={lang}>
      {posterUrl ? <div class="around-poster" style={{ width: `${width}px` }}><ProgrammePoster url={posterUrl} width={width} /></div> : null}
      {rest}
      <Ratings list={ratings} />
    </div>
  );
}

export interface Rating { name: string; value: number }

/** "Кинопоиск: [5.7/10]", "КиноПоиск [7.9]", "IMDb: 7.8", "IMDb [7.2]" as the guides write them. */
const RATING = /(Кинопоиск|КиноПоиск|IMDb)\s*:?\s*\[?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:\/\s*10)?\s*\]?/gi;

/** A guide's description without its ratings, and the ratings themselves (shown apart, coloured by value). */
export function splitRatings(text: string): { rest: string; ratings: Rating[] } {
  const ratings: Rating[] = [];
  const rest = text.replace(RATING, (_m, name: string, v: string) => {
    const value = Number(v.replace(",", "."));
    if (value > 0 && value <= 10 && !ratings.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      ratings.push({ name: /imdb/i.test(name) ? "IMDb" : "Кинопоиск", value });
    }
    return "\u0000";
  })
    // Only where a rating stood: the comma or space it leaves, never the text around elsewhere.
    .replace(/\s*\u0000[\s,;]*/g, (m, at: number, all: string) => (at + m.length >= all.length ? "" : " "))
    .replace(/\s{2,}/g, " ").trim();
  return { rest, ratings };
}

/** Green from 7, yellow from 5, red below (as rating sites colour them). */
export function ratingTone(v: number): "good" | "mid" | "bad" { return v >= 7 ? "good" : v >= 5 ? "mid" : "bad"; }

/** "Оценки: Кинопоиск 5,7 · IMDb 6,1", each value coloured; nothing when there are none. */
export function Ratings({ list }: { list: readonly Rating[] }) {
  if (list.length === 0) return null;
  const num = (v: number) => (Math.round(v * 10) / 10).toString().replace(".", ",");
  return (
    <div class="ratings">
      <b>{t("ratingsLabel")}:</b>
      {list.map((r) => <span key={r.name} class="rating">{r.name} <span class={`rv ${ratingTone(r.value)}`}>{num(r.value)}</span></span>)}
    </div>
  );
}
