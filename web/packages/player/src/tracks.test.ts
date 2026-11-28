import { afterEach, describe, expect, it, vi } from "vitest";
import {
  audioRenditions, fetchRenditions, audioToSelect, CAPTION_ID_BASE, elementTracks, hlsTracks, languageIdentity, languageMatches, showAudioTile, showSubtitleTile,
  subtitleAction, SUBTITLES_OFF, type HlsTrackApi, type TrackOption,
} from "./tracks";

const tr = (id: number, lang: string, selected = false, label = ""): TrackOption => ({ id, lang, selected, label });

describe("languageMatches (Android SubtitleLanguage.kt)", () => {
  it("matches two- and three-letter codes, bibliographic forms and regional tags", () => {
    expect(languageMatches("en", "eng")).toBe(true);
    expect(languageMatches("eng", "en-US")).toBe(true);
    expect(languageMatches("de", "ger")).toBe(true);
    expect(languageMatches("deu", "ger")).toBe(true);
    expect(languageMatches("fr", "fre")).toBe(true);
    expect(languageMatches("ru", "RUS")).toBe(true);
    expect(languageMatches("uz", "uzb")).toBe(true);
    expect(languageMatches("en_GB", "en")).toBe(true);
  });
  it("does not match different languages, blanks or nothing", () => {
    expect(languageMatches("en", "ru")).toBe(false);
    expect(languageMatches("", "en")).toBe(false);
    expect(languageMatches("en", "")).toBe(false);
    expect(languageMatches("en", null)).toBe(false);
    expect(languageMatches("nb", "no")).toBe(false); // as Java: nob ≠ nor
  });
  it("keeps an unknown code as it is", () => {
    expect(languageIdentity("xyz")).toBe("xyz");
    expect(languageIdentity("ger")).toBe("deu");
  });
});

describe("audioToSelect (TrackMemory.kt)", () => {
  const tracks = [tr(0, "ru", true), tr(1, "eng"), tr(2, "de")];
  it("finds the remembered language", () => {
    expect(audioToSelect(tracks, "en")?.id).toBe(1);
    expect(audioToSelect(tracks, "ger")?.id).toBe(2);
  });
  it("does nothing when that language already plays, none matches, or nothing is remembered", () => {
    expect(audioToSelect(tracks, "rus")).toBeNull();
    expect(audioToSelect(tracks, "fr")).toBeNull();
    expect(audioToSelect(tracks, null)).toBeNull();
    expect(audioToSelect(tracks, "  ")).toBeNull();
  });
});

describe("subtitleAction (TrackMemory.kt)", () => {
  it("turns subtitles off only when some are on", () => {
    expect(subtitleAction([tr(0, "en", true)], SUBTITLES_OFF)).toEqual({ kind: "off" });
    expect(subtitleAction([tr(0, "en")], SUBTITLES_OFF)).toEqual({ kind: "none" });
  });
  it("selects the remembered language unless it is already shown", () => {
    expect(subtitleAction([tr(0, "ru"), tr(1, "en")], "eng")).toEqual({ kind: "select", track: tr(1, "en") });
    expect(subtitleAction([tr(1, "en", true)], "eng")).toEqual({ kind: "none" });
    expect(subtitleAction([tr(0, "ru")], "eng")).toEqual({ kind: "none" });
    expect(subtitleAction([tr(0, "ru")], undefined)).toEqual({ kind: "none" });
  });
});

describe("tiles (PlayerHud.kt:903-904)", () => {
  it("audio only with a choice, subtitles with any track", () => {
    expect(showAudioTile([])).toBe(false);
    expect(showAudioTile([tr(0, "ru", true)])).toBe(false);
    expect(showAudioTile([tr(0, "ru", true), tr(1, "en")])).toBe(true);
    expect(showSubtitleTile([])).toBe(false);
    expect(showSubtitleTile([tr(0, "en")])).toBe(true);
  });
});

/** A <video> with lists, as a browser that has both `audioTracks` and `textTracks` would give. */
function fakeVideo(audio: Array<{ label: string; language: string; enabled: boolean }>, text: Array<{ kind: string; label: string; language: string; mode: string }>) {
  const withEvents = <T,>(items: T[]) => Object.assign(items, { addEventListener() { /* */ }, removeEventListener() { /* */ } });
  return { audioTracks: withEvents(audio.map((a, i) => ({ id: String(i), ...a }))), textTracks: withEvents(text) } as unknown as HTMLVideoElement;
}

describe("elementTracks (the <video> element's own lists)", () => {
  it("reads audio and subtitle tracks and switches them", () => {
    const v = fakeVideo(
      [{ label: "Main", language: "ru", enabled: true }, { label: "", language: "en", enabled: false }],
      [{ kind: "subtitles", label: "English", language: "en", mode: "disabled" }, { kind: "metadata", label: "", language: "", mode: "hidden" }, { kind: "captions", label: "CC", language: "en", mode: "disabled" }],
    );
    const src = elementTracks(v);
    expect(src.audio()).toEqual([tr(0, "ru", true, "Main"), tr(1, "en")]);
    expect(src.subtitles().map((x) => x.id)).toEqual([0, 2]); // the metadata track is not a subtitle
    src.selectAudio(1);
    expect(src.audio().map((x) => x.selected)).toEqual([false, true]);
    src.selectSubtitle(2);
    expect(src.subtitles().map((x) => x.selected)).toEqual([false, true]);
    src.selectSubtitle(null);
    expect(src.subtitles().some((x) => x.selected)).toBe(false);
  });
  it("offers no audio where the browser has no audioTracks (Chromium without its flag)", () => {
    const v = { textTracks: Object.assign([], { addEventListener() { /* */ } }) } as unknown as HTMLVideoElement;
    expect(elementTracks(v).audio()).toEqual([]);
    expect(elementTracks(v).subtitles()).toEqual([]);
    expect(() => elementTracks(v).selectAudio(0)).not.toThrow();
  });
});

describe("hlsTracks", () => {
  const api = (): HlsTrackApi & { events: string[] } => ({
    audioTracks: [{ name: "Русский", lang: "ru" }, { name: "English", lang: "en" }],
    audioTrack: 0,
    subtitleTracks: [{ name: "English", lang: "en" }],
    subtitleTrack: -1,
    subtitleDisplay: true,
    events: [],
    on(e) { this.events.push(e); },
    off() { /* */ },
  });
  it("lists hls.js' renditions and in-stream captions, and switches them", () => {
    const h = api();
    const v = fakeVideo([], [{ kind: "subtitles", label: "English", language: "en", mode: "disabled" }, { kind: "captions", label: "CC1", language: "en", mode: "disabled" }]);
    const src = hlsTracks(() => h, v);
    expect(src.audio().map((x) => [x.id, x.selected])).toEqual([[0, true], [1, false]]);
    // hls.js' own subtitle (the element's "subtitles" copy is not listed twice), then the caption track.
    expect(src.subtitles().map((x) => x.id)).toEqual([0, CAPTION_ID_BASE + 1]);
    src.selectAudio(1);
    expect(h.audioTrack).toBe(1);
    src.selectSubtitle(0);
    expect(h.subtitleTrack).toBe(0);
    expect(src.subtitles()[0]?.selected).toBe(true);
    src.selectSubtitle(CAPTION_ID_BASE + 1);
    expect(h.subtitleTrack).toBe(-1);
    expect(src.subtitles().map((x) => x.selected)).toEqual([false, true]);
    src.selectSubtitle(null);
    expect(src.subtitles().some((x) => x.selected)).toBe(false);
    src.watch(() => undefined);
    expect(h.events).toContain("hlsAudioTracksUpdated");
  });
  it("is empty before hls.js exists", () => {
    const src = hlsTracks(() => null, fakeVideo([], []));
    expect(src.audio()).toEqual([]);
    expect(src.subtitles()).toEqual([]);
  });
});

describe("audio renditions of an HLS master (#772)", () => {
  it("lists each audio track once, across the quality groups", () => {
    const m = [
      "#EXTM3U",
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a1",NAME="Русский",LANGUAGE="ru",DEFAULT=YES,URI="ru1.m3u8"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a1",NAME="English",LANGUAGE="en",URI="en1.m3u8"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a2",NAME="Русский",LANGUAGE="ru",DEFAULT=YES,URI="ru2.m3u8"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="s",NAME="Русские",URI="s.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=1,AUDIO="a1"', "v1.m3u8",
    ].join("\n");
    expect(audioRenditions(m).map((t) => [t.label, t.lang, t.selected])).toEqual([["Русский", "ru", true], ["English", "en", false]]);
    expect(audioRenditions("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv.m3u8")).toEqual([]);
  });
});

describe("fetchRenditions (#822)", () => {
  const master = "#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"a\",NAME=\"Русский\",LANGUAGE=\"ru\",DEFAULT=YES,URI=\"ru.m3u8\"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"a\",NAME=\"English\",LANGUAGE=\"en\",URI=\"en.m3u8\"\n#EXT-X-STREAM-INF:BANDWIDTH=1,AUDIO=\"a\"\nv.m3u8\n";
  const serve = (body: Uint8Array | string, type = "") => vi.fn(async () => new Response(body, { headers: { "content-type": type } }));
  afterEach(() => { vi.unstubAllGlobals(); });
  it("reads a master playlist at an address without .m3u8", async () => {
    vi.stubGlobal("fetch", serve(master, "application/octet-stream"));
    const found = await fetchRenditions("http://x/live/u/p/123");
    expect(found.map((t) => t.lang)).toEqual(["ru", "en"]);
  });
  it("stops at a raw stream and never looks into a .ts address", async () => {
    vi.stubGlobal("fetch", serve(new Uint8Array([0x47, 1, 2, 3, 4, 5, 6, 7, 8])));
    expect(await fetchRenditions("http://x/live/1")).toEqual([]);
    const f = serve(master);
    vi.stubGlobal("fetch", f);
    expect(await fetchRenditions("http://x/live/1.ts")).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});
