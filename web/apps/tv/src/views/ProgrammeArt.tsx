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
  return (
    <div class={`around${cls ? ` ${cls}` : ""}`} lang={lang}>
      {posterUrl ? <div class="around-poster" style={{ width: `${width}px` }}><ProgrammePoster url={posterUrl} width={width} /></div> : null}
      {text}
    </div>
  );
}
