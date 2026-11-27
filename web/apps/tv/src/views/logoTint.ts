import { useEffect, useState } from "preact/hooks";

/**
 * The colour a card takes from its channel's logo (Android LogoTint.kt, 2.6.0): the logo's average colour, darkened
 * to a matte. A logo that is white or black, or that cannot be read (another site without CORS), gets null and the
 * card keeps its grey. Each address is worked out once for the life of the app (2.6.1).
 */
const known = new Map<string, string | null>();
const waiting = new Map<string, Promise<string | null>>();

export function tintOf(r: number, g: number, b: number): string | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Hardly any colour (white, black, grey logos): the matte grey stays.
  if (max - min < 28) return null;
  const k = 70 / Math.max(1, max);
  const c = (v: number) => Math.round(Math.min(255, v * k + 22));
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

function read(url: string): Promise<string | null> {
  const ready = waiting.get(url);
  if (ready) return ready;
  const job = new Promise<string | null>((done) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const size = 16;
        const cv = document.createElement("canvas");
        cv.width = size; cv.height = size;
        const ctx = cv.getContext("2d");
        if (!ctx) return done(null);
        ctx.drawImage(img, 0, 0, size, size);
        const px = ctx.getImageData(0, 0, size, size).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < px.length; i += 4) {
          const a = px[i + 3] as number;
          if (a < 128) continue;
          const pr = px[i] as number, pg = px[i + 1] as number, pb = px[i + 2] as number;
          // Near-white and near-black pixels are the background and the outline, not the logo's colour.
          if (Math.max(pr, pg, pb) - Math.min(pr, pg, pb) < 24) continue;
          r += pr; g += pg; b += pb; n++;
        }
        done(n < 8 ? null : tintOf(r / n, g / n, b / n));
      } catch { done(null); }
    };
    img.onerror = () => done(null);
    img.src = url;
  }).then((v) => { known.set(url, v); waiting.delete(url); return v; });
  waiting.set(url, job);
  return job;
}

export function useLogoTint(url: string | undefined): string | null {
  const [tint, setTint] = useState<string | null>(() => (url ? known.get(url) ?? null : null));
  useEffect(() => {
    if (!url) { setTint(null); return; }
    if (known.has(url)) { setTint(known.get(url) ?? null); return; }
    let live = true;
    read(url).then((v) => { if (live) setTint(v); });
    return () => { live = false; };
  }, [url]);
  return tint;
}
