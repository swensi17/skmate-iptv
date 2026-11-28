/*
 * Audio and subtitle tracks, as the Android app offers them (player/TrackMemory.kt, SubtitleLanguage.kt,
 * PlayerHudDialogs.kt TrackDialog): what an engine exposes, how a remembered language is matched to a track,
 * and the two sources a browser has — hls.js' own lists (alternate renditions) and the <video> element's
 * `audioTracks` / `textTracks` (only where the browser has them: feature-checked, never assumed).
 */

/** One audio or subtitle track (Android TrackOption): an engine-scoped id, the stream's own label and language. */
export interface TrackOption {
  id: number;
  /** The stream's label ("English", "Main"); "" when it gives none. */
  label: string;
  /** The language tag as the stream writes it ("en", "eng", "ger", "en-US"); "" when none. */
  lang: string;
  selected: boolean;
}

/** What an engine can tell about its tracks and switch. */
export interface TrackSource {
  audio(): TrackOption[];
  subtitles(): TrackOption[];
  selectAudio(id: number): void;
  /** null turns subtitles off. */
  selectSubtitle(id: number | null): void;
  /** Calls [onChange] whenever a list or a choice changes; returns the way to stop. */
  watch(onChange: () => void): () => void;
}

/** The stored subtitle choice meaning "the user turned subtitles off here" (PlaybackPrefsStore.SUBTITLES_OFF). */
export const SUBTITLES_OFF = "off";

/** ISO 639-2/B ("bibliographic") codes and their 639-2/T forms: broadcast tracks often carry `ger`, `fre`. */
const B_TO_T: Record<string, string> = {
  alb: "sqi", arm: "hye", baq: "eus", bur: "mya", chi: "zho", cze: "ces", dut: "nld", fre: "fra", geo: "kat", ger: "deu",
  gre: "ell", ice: "isl", mac: "mkd", mao: "mri", may: "msa", per: "fas", rum: "ron", slo: "slk", tib: "bod", wel: "cym",
};

/** ISO 639-1 → 639-2/T, what Java's `Locale.isO3Language` gives Android for the two-letter tags. */
const ONE_TO_THREE: Record<string, string> = {
  af: "afr", am: "amh", ar: "ara", az: "aze", be: "bel", bg: "bul", bn: "ben", bo: "bod", bs: "bos", ca: "cat", cs: "ces",
  cy: "cym", da: "dan", de: "deu", el: "ell", en: "eng", es: "spa", et: "est", eu: "eus", fa: "fas", fi: "fin", fr: "fra",
  ga: "gle", gl: "glg", gu: "guj", he: "heb", iw: "heb", hi: "hin", hr: "hrv", hu: "hun", hy: "hye", id: "ind", in: "ind",
  is: "isl", it: "ita", ja: "jpn", ka: "kat", kk: "kaz", km: "khm", kn: "kan", ko: "kor", ku: "kur", ky: "kir", la: "lat",
  lo: "lao", lt: "lit", lv: "lav", mk: "mkd", ml: "mal", mn: "mon", mr: "mar", ms: "msa", my: "mya", nb: "nob", ne: "nep",
  nl: "nld", nn: "nno", no: "nor", pa: "pan", pl: "pol", ps: "pus", pt: "por", ro: "ron", ru: "rus", si: "sin", sk: "slk",
  sl: "slv", so: "som", sq: "sqi", sr: "srp", sv: "swe", sw: "swa", ta: "tam", te: "tel", tg: "tgk", th: "tha", tk: "tuk",
  tl: "tgl", tr: "tur", uk: "ukr", ur: "urd", uz: "uzb", vi: "vie", yi: "yid", zh: "zho", zu: "zul",
};

/** One spelling per language: "en", "eng", "en-US" → "eng"; "ger", "de" → "deu". Unknown codes stay as they are. */
export function languageIdentity(code: string): string {
  const raw = code.trim().replace(/_/g, "-").toLowerCase();
  const base = raw.split("-")[0] ?? "";
  const t = B_TO_T[base] ?? base;
  return ONE_TO_THREE[t] ?? t;
}

/** Android subtitleLanguageMatches: ISO 639-1/2 and regional tags match one another (eng, en, en-US). */
export function languageMatches(preferred: string, actual: string | null | undefined): boolean {
  if (!preferred.trim() || !actual || !actual.trim()) return false;
  return languageIdentity(preferred) === languageIdentity(actual);
}

/** TrackMemory.audioToSelect: the track to switch to for [lang], or null when none matches or one already plays. */
export function audioToSelect(tracks: readonly TrackOption[], lang: string | null | undefined, name?: string | null): TrackOption | null {
  if (lang && lang.trim()) {
    if (tracks.some((x) => x.selected && languageMatches(lang, x.lang))) return null;
    const byLang = tracks.find((x) => languageMatches(lang, x.lang));
    if (byLang) return byLang;
  }
  // Android 2.5.2 (applyRememberedAudio): a channel's track kept by its name, with a choice to make.
  if (!name || !name.trim() || tracks.length < 2) return null;
  const n = name.trim();
  const track = tracks.find((x) => x.label === n) ?? tracks.find((x) => x.label.toLowerCase() === n.toLowerCase());
  return track && !track.selected ? track : null;
}

export type SubtitleAction = { kind: "none" } | { kind: "off" } | { kind: "select"; track: TrackOption };

/** TrackMemory.subtitleAction: what a remembered subtitle choice (a language or [SUBTITLES_OFF]) asks for. */
export function subtitleAction(tracks: readonly TrackOption[], choice: string | null | undefined): SubtitleAction {
  if (!choice || !choice.trim()) return { kind: "none" };
  if (choice === SUBTITLES_OFF) return tracks.some((x) => x.selected) ? { kind: "off" } : { kind: "none" };
  if (tracks.some((x) => x.selected && languageMatches(choice, x.lang))) return { kind: "none" };
  const track = tracks.find((x) => languageMatches(choice, x.lang));
  return track ? { kind: "select", track } : { kind: "none" };
}

/** The audio tile is there only with a choice to make (PlayerHud.kt: `audioCount > 1`), subtitles with any track. */
export function showAudioTile(audio: readonly TrackOption[]): boolean { return audio.length > 1; }
export function showSubtitleTile(subs: readonly TrackOption[]): boolean { return subs.length > 0; }

/* ---------- The <video> element's own lists (feature-checked: Chromium has `audioTracks` only behind a flag) ---------- */

interface AudioTrackLike { id: string; label: string; language: string; enabled: boolean }
interface ListLike<T> { length: number; [i: number]: T; addEventListener?(type: string, fn: () => void): void; removeEventListener?(type: string, fn: () => void): void }

function audioList(video: HTMLVideoElement): ListLike<AudioTrackLike> | null {
  const list = (video as unknown as { audioTracks?: ListLike<AudioTrackLike> }).audioTracks;
  return list && typeof list.length === "number" ? list : null;
}

function textList(video: HTMLVideoElement): ListLike<TextTrack> | null {
  const list = (video as unknown as { textTracks?: ListLike<TextTrack> }).textTracks;
  return list && typeof list.length === "number" ? list : null;
}

const isSubtitle = (t: TextTrack) => t.kind === "subtitles" || t.kind === "captions";

/** The text tracks a viewer can pick, with their index in the element's list as the id. */
function elementSubtitles(video: HTMLVideoElement, base = 0, only?: (t: TextTrack) => boolean): TrackOption[] {
  const list = textList(video);
  if (!list) return [];
  const out: TrackOption[] = [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i] as TextTrack;
    if (!isSubtitle(t) || (only && !only(t))) continue;
    out.push({ id: base + i, label: t.label || "", lang: t.language || "", selected: t.mode === "showing" });
  }
  return out;
}

function showText(video: HTMLVideoElement, index: number | null, only?: (t: TextTrack) => boolean): void {
  const list = textList(video);
  if (!list) return;
  for (let i = 0; i < list.length; i++) {
    const t = list[i] as TextTrack;
    if (!isSubtitle(t) || (only && !only(t))) continue;
    t.mode = i === index ? "showing" : "disabled";
  }
}

function listen(list: ListLike<unknown> | null, fn: () => void): () => void {
  if (!list || !list.addEventListener) return () => undefined;
  const events = ["change", "addtrack", "removetrack"];
  events.forEach((e) => list.addEventListener?.(e, fn));
  return () => events.forEach((e) => list.removeEventListener?.(e, fn));
}

/**
 * The tracks of the page's own decoder (the TV's <video src>, mpegts.js on Media Source): `audioTracks` where the
 * browser has it (Safari, some TV firmware; Chromium only behind a flag), `textTracks` everywhere.
 */
export function elementTracks(video: HTMLVideoElement): TrackSource {
  return {
    audio() {
      const list = audioList(video);
      if (!list) return [];
      const out: TrackOption[] = [];
      for (let i = 0; i < list.length; i++) {
        const t = list[i] as AudioTrackLike;
        out.push({ id: i, label: t.label || "", lang: t.language || "", selected: !!t.enabled });
      }
      return out;
    },
    subtitles: () => elementSubtitles(video),
    selectAudio(id) {
      const list = audioList(video);
      if (!list || id < 0 || id >= list.length) return;
      // Enable the chosen one first: some players drop the sound for a moment with none enabled.
      (list[id] as AudioTrackLike).enabled = true;
      for (let i = 0; i < list.length; i++) if (i !== id) (list[i] as AudioTrackLike).enabled = false;
    },
    selectSubtitle: (id) => showText(video, id),
    watch(fn) {
      const a = listen(audioList(video), fn);
      const t = listen(textList(video), fn);
      return () => { a(); t(); };
    },
  };
}

/* ---------- hls.js: its alternate renditions, plus the CEA-608 captions it puts on the element ---------- */

/** What of hls.js is used here (kept structural so the library is still loaded only when needed). */
export interface HlsTrackApi {
  readonly audioTracks: ReadonlyArray<{ name: string; lang?: string }>;
  audioTrack: number;
  readonly subtitleTracks: ReadonlyArray<{ name: string; lang?: string }>;
  subtitleTrack: number;
  subtitleDisplay: boolean;
  on(event: string, fn: () => void): void;
  off(event: string, fn: () => void): void;
}

/** Ids at and above this name a caption track of the element (CEA-608 inside the video), not an hls.js subtitle. */
export const CAPTION_ID_BASE = 1000;

export const HLS_TRACK_EVENTS = [
  "hlsManifestParsed", "hlsAudioTracksUpdated", "hlsAudioTrackSwitched", "hlsSubtitleTracksUpdated", "hlsSubtitleTrackSwitch",
];

/** In-stream captions hls.js draws as the element's text tracks; its own subtitle renditions are picked through it. */
const isCaption = (t: TextTrack) => t.kind === "captions";

export function hlsTracks(hls: () => HlsTrackApi | null, video: HTMLVideoElement): TrackSource {
  return {
    audio() {
      const h = hls();
      if (!h) return [];
      return h.audioTracks.map((t, i) => ({ id: i, label: t.name || "", lang: t.lang || "", selected: i === h.audioTrack }));
    },
    subtitles() {
      const h = hls();
      const own = h ? h.subtitleTracks.map((t, i) => ({ id: i, label: t.name || "", lang: t.lang || "", selected: h.subtitleDisplay && i === h.subtitleTrack })) : [];
      return [...own, ...elementSubtitles(video, CAPTION_ID_BASE, isCaption)];
    },
    selectAudio(id) {
      const h = hls();
      if (h && id >= 0 && id < h.audioTracks.length) h.audioTrack = id;
    },
    selectSubtitle(id) {
      const h = hls();
      if (id !== null && id >= CAPTION_ID_BASE) {
        if (h) h.subtitleTrack = -1;
        showText(video, id - CAPTION_ID_BASE, isCaption);
        return;
      }
      showText(video, null, isCaption);
      if (!h) return;
      if (id === null) { h.subtitleTrack = -1; return; }
      h.subtitleDisplay = true;
      h.subtitleTrack = id;
    },
    watch(fn) {
      const h = hls();
      HLS_TRACK_EVENTS.forEach((e) => h?.on(e, fn));
      const t = listen(textList(video), fn);
      return () => { HLS_TRACK_EVENTS.forEach((e) => h?.off(e, fn)); t(); };
    },
  };
}

/**
 * The audio renditions an HLS master playlist offers (#EXT-X-MEDIA TYPE=AUDIO), for a TV whose own decoder plays the
 * stream but does not tell its tracks (Chromium keeps `audioTracks` behind a flag: Tizen, webOS). With more than one,
 * the player offers them and opens the stream on hls.js, which can switch (#772).
 */
export function audioRenditions(master: string): TrackOption[] {
  if (!/^\s*#EXTM3U/.test(master)) return [];
  const out: TrackOption[] = [];
  const seen = new Set<string>();
  for (const line of master.split(/\r?\n/)) {
    if (!line.startsWith("#EXT-X-MEDIA:") || !/TYPE=AUDIO/.test(line)) continue;
    const attr = (k: string) => (line.match(new RegExp(`${k}="([^"]*)"`)) ?? [])[1] ?? "";
    const label = attr("NAME");
    const lang = attr("LANGUAGE");
    const key = `${label}|${lang}`;
    if (seen.has(key)) continue; // the same track in several groups (one per quality)
    seen.add(key);
    out.push({ id: out.length, label, lang, selected: /DEFAULT=YES/.test(line) });
  }
  if (out.length > 0 && !out.some((t) => t.selected)) (out[0] as TrackOption).selected = true;
  return out;
}

/** An address that is surely not an HLS playlist (a file or a raw stream): no need to look inside it. */
export function surelyNotHls(url: string): boolean {
  return /\.(ts|mts|mp4|m4v|mkv|avi|mov|webm|mp3|aac|flv)(\?|#|$)/i.test(url);
}

/**
 * The audio renditions of the stream at [url], read from its start only (64 KB at most, then the download stops):
 * a provider's address often has no ".m3u8" in it, or is a raw MPEG-TS stream that never ends (#822).
 */
export async function fetchRenditions(url: string, headers?: Record<string, string>): Promise<TrackOption[]> {
  if (surelyNotHls(url)) return [];
  const r = await fetch(url, { headers });
  if (!r.ok) return [];
  const type = r.headers.get("content-type") ?? "";
  const reader = r.body && typeof r.body.getReader === "function" ? r.body.getReader() : null;
  if (!reader) return /mpegurl/i.test(type) || /\.m3u8(\?|$)/i.test(url) ? audioRenditions(await r.text()) : [];
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < 65_536) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      parts.push(value);
      size += value.length;
      if (size >= 7 && parts.length === 1 && value[0] !== 0x23 && value[0] !== 0xef && value[0] !== 0x20 && value[0] !== 0x0a && value[0] !== 0x0d) break; // not text: a raw stream
    }
  } finally { reader.cancel().catch(() => undefined); }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  return audioRenditions(new TextDecoder("utf-8").decode(all));
}
