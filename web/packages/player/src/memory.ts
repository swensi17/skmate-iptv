import { isZoomMode, type ZoomMode } from "./zoom";

/*
 * What the viewer chose for one item, as Android's PlaybackPrefsStore keeps it (playback_prefs): the zoom picked in
 * the player, and the audio / subtitle choice as a *language* (ids change between streams of one channel and
 * between episodes, "the German track" does not). The key is a channel, a film, or a whole series.
 */

export interface ItemPrefs {
  zoom?: ZoomMode;
  /** The language of the audio track picked last. */
  audio?: string;
  /** The language of the subtitle track picked last, or SUBTITLES_OFF. */
  sub?: string;
  /** When it was last written: the oldest items go first once the store is full. */
  at: number;
}

interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

const KEY = "skmate.itemPrefs.v1";
/** Enough for every channel and film a household really returns to; older choices are dropped first. */
const MAX_ITEMS = 500;

export class ItemPrefsStore {
  constructor(private readonly storage: () => StorageLike | null) {}

  private read(): Record<string, ItemPrefs> {
    try {
      const raw = this.storage()?.getItem(KEY);
      const v = raw ? (JSON.parse(raw) as unknown) : null;
      return v && typeof v === "object" ? (v as Record<string, ItemPrefs>) : {};
    } catch { return {}; }
  }

  private write(all: Record<string, ItemPrefs>): void {
    const keys = Object.keys(all);
    if (keys.length > MAX_ITEMS) {
      keys.sort((a, b) => (all[a]?.at ?? 0) - (all[b]?.at ?? 0)).slice(0, keys.length - MAX_ITEMS).forEach((k) => { delete all[k]; });
    }
    try { this.storage()?.setItem(KEY, JSON.stringify(all)); } catch { /* full or unavailable: the choice holds for this session only */ }
  }

  private patch(key: string, p: Partial<ItemPrefs>): void {
    if (!key) return;
    const all = this.read();
    all[key] = { ...all[key], ...p, at: Date.now() };
    this.write(all);
  }

  get(key: string): ItemPrefs | null {
    if (!key) return null;
    const p = this.read()[key];
    if (!p) return null;
    return { ...p, ...(p.zoom !== undefined && !isZoomMode(p.zoom) ? { zoom: undefined } : {}) };
  }

  rememberZoom(key: string, zoom: ZoomMode): void { this.patch(key, { zoom }); }
  /** A blank language is not remembered (a track that names none says nothing to match later). */
  rememberAudio(key: string, lang: string): void { if (lang.trim()) this.patch(key, { audio: lang }); }
  rememberSubtitle(key: string, langOrOff: string): void { if (langOrOff.trim()) this.patch(key, { sub: langOrOff }); }

  /** Settings › reset saved zoom: every item back to the default zoom; audio and subtitle choices are kept. */
  clearZoom(): void {
    const all = this.read();
    for (const k of Object.keys(all)) {
      const p = all[k] as ItemPrefs;
      if (p.zoom === undefined) continue;
      delete p.zoom;
      if (p.audio === undefined && p.sub === undefined) delete all[k];
    }
    this.write(all);
  }

  /** How many items remember a zoom (the reset row's count). */
  zoomCount(): number {
    return Object.values(this.read()).filter((p) => p && p.zoom !== undefined).length;
  }
}

export const itemPrefs = new ItemPrefsStore(() => (typeof localStorage !== "undefined" ? localStorage : null));
