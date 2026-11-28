/*
 * The six zoom modes of the Android app (OwnTVPlayer.kt ZoomMode, VideoZoom.kt videoZoom), for a <video> that
 * always fills its box: `object-fit` plus one `transform: scale()`, computed once per mode, picture size or box
 * (never per frame, and never a re-layout).
 *   fit      the whole picture, letterboxed (contain)
 *   crop     the fit box enlarged by 1.2 and cut at the edges (Android ZOOM_CROP_FACTOR: visible even when the
 *            picture's shape already matches the screen, unlike a plain "cover")
 *   stretch  the picture stretched over the box (fill)
 *   original one stream pixel per screen pixel, centred (larger pictures are cut, smaller ones float)
 *   16_9     the picture stretched into the largest 16:9 box that fits
 *   4_3      the same with 4:3
 *   2_39     a 2.39:1 film letterboxed inside the stream: enlarged until its picture fills the height, the sides cut
 */

export type ZoomMode = "fit" | "crop" | "stretch" | "original" | "16_9" | "4_3" | "2_39";

/** Android's order (OwnTVPlayer.kt:121-124), the order of the dialog's rows. */
export const ZOOM_MODES: readonly ZoomMode[] = ["fit", "crop", "stretch", "original", "16_9", "4_3", "2_39"];

export const ZOOM_CROP_FACTOR = 1.2;

export function isZoomMode(v: unknown): v is ZoomMode {
  return typeof v === "string" && (ZOOM_MODES as readonly string[]).includes(v);
}

export interface Size { w: number; h: number }
export interface ZoomLook { objectFit: "contain" | "fill"; scaleX: number; scaleY: number }

const FIT: ZoomLook = { objectFit: "contain", scaleX: 1, scaleY: 1 };

/**
 * How the element shows [video] (its pixel size, null before the first frame) inside its [box] (CSS px) for [mode].
 * [devicePerCss]: screen pixels per CSS pixel of the box (the page scale times devicePixelRatio), for "original".
 */
export function zoomLook(mode: ZoomMode, video: Size | null, box: Size, devicePerCss = 1): ZoomLook {
  if (mode === "stretch") return { objectFit: "fill", scaleX: 1, scaleY: 1 };
  if (!video || !(video.w > 0) || !(video.h > 0) || !(box.w > 0) || !(box.h > 0)) return FIT;
  const aspect = video.w / video.h;
  const boxAspect = box.w / box.h;
  const fitW = aspect >= boxAspect ? box.w : box.h * aspect;
  switch (mode) {
    case "crop": return { objectFit: "contain", scaleX: ZOOM_CROP_FACTOR, scaleY: ZOOM_CROP_FACTOR };
    case "original": {
      const k = video.w / Math.max(0.01, devicePerCss) / fitW;
      return { objectFit: "contain", scaleX: k, scaleY: k };
    }
    case "2_39": {
      const k = Math.max(1, box.h / (fitW / 2.39));
      return { objectFit: "contain", scaleX: k, scaleY: k };
    }
    case "16_9":
    case "4_3": {
      const target = mode === "16_9" ? 16 / 9 : 4 / 3;
      const w = target >= boxAspect ? box.w : box.h * target;
      const h = target >= boxAspect ? box.w / target : box.h;
      return { objectFit: "fill", scaleX: w / box.w, scaleY: h / box.h };
    }
    default: return FIT;
  }
}

/** The CSS transform of a look: "none" when it scales nothing (the usual case keeps no transform at all). */
export function zoomTransform(l: ZoomLook): string {
  const r = (n: number) => Math.round(n * 10_000) / 10_000;
  return Math.abs(l.scaleX - 1) < 1e-4 && Math.abs(l.scaleY - 1) < 1e-4 ? "none" : `scale(${r(l.scaleX)}, ${r(l.scaleY)})`;
}

/**
 * The default zoom from the two stored fields: Settings › default zoom writes both `zoomMode` and the older
 * `aspect` (fit / cover / fill), the player sheet writes `aspect` alone. Whichever was written last wins: when they
 * disagree, `aspect` was changed after `zoomMode`.
 */
export function defaultZoom(zoomMode: string, aspect: string): ZoomMode {
  const viaAspect: ZoomMode = aspect === "cover" ? "crop" : aspect === "fill" ? "stretch" : "fit";
  if (!isZoomMode(zoomMode)) return viaAspect;
  const zoomAspect = zoomMode === "crop" ? "cover" : zoomMode === "stretch" ? "fill" : "fit";
  return zoomAspect === (aspect === "cover" || aspect === "fill" ? aspect : "fit") ? zoomMode : viaAspect;
}
