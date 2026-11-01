import { describe, expect, it } from "vitest";
import { isProgressiveVideoUrl, mediaOf, parseM3U } from "./m3u/parse";
import {
  canResume, inWatchingOrder, isWatched, m3uLibrary, nextEpisode, numberBlankEpisodes, parseEpisodeName, parseXtreamEpisodes,
  parseXtreamMovies, parseXtreamShows, seasonsOf, xtreamAccount, xtreamApiUrl, xtreamEpisodeUrl, xtreamMovieUrl,
} from "./vod";

// The cases of the Android app's M3uVodByExtensionTest.
describe("film, series or live in an M3U", () => {
  it("takes an untagged film file as a film, whatever its case or query", () => {
    expect(mediaOf(undefined, undefined, "http://h/movie/u/p/101.mkv")).toBe("movie");
    expect(mediaOf(undefined, undefined, "http://h/Sintel.MP4?token=abc")).toBe("movie");
    expect(mediaOf(undefined, undefined, "http://h/7.mp4|User-Agent=Foo")).toBe("movie");
  });
  it("leaves live streams live", () => {
    for (const u of ["http://h/live/4.ts", "http://h/live.m3u8", "http://h/live/4", "http://h/movies.mp4/live/4.ts", "rtmp://h/a.mp4"]) {
      expect(mediaOf(undefined, undefined, u)).toBeUndefined();
    }
  });
  it("lets a tag win over the address, a blank tag falls back to it", () => {
    expect(mediaOf(undefined, "live", "http://h/a.mp4")).toBeUndefined();
    expect(mediaOf("stream", undefined, "http://h/a.mp4")).toBeUndefined();
    expect(mediaOf(undefined, "movie", "http://h/a.m3u8")).toBe("movie");
    expect(mediaOf("vod", undefined, "http://h/a")).toBe("movie");
    expect(mediaOf(undefined, "series", "http://h/a.ts")).toBe("series");
    expect(mediaOf(undefined, " ", "http://h/a.mp4")).toBe("movie");
  });
  it("does not make a series of an untagged episode name", () => {
    const [c] = parseM3U('#EXTM3U\n#EXTINF:-1,Show S01E05\nhttp://h/show.s01e05.mkv\n');
    expect(c?.media).toBe("movie");
    expect(isProgressiveVideoUrl("file:///films/a.avi")).toBe(true);
  });
});

// The cases of the Android app's M3uEpisodeNameTest.
describe("episode names", () => {
  it("reads the common marker, with the title after it", () => {
    expect(parseEpisodeName("Stranger Things S01E05 - The Flea and the Acrobat")).toEqual({ show: "Stranger Things", season: 1, episode: 5, title: "The Flea and the Acrobat" });
  });
  it("takes specials as season 0, years and long runs as they are", () => {
    for (const n of ["Show S00E01", "Show 0x01", "Show Season 0 Episode 1"]) expect(parseEpisodeName(n).season).toBe(0);
    expect(parseEpisodeName("MythBusters S2019E05")).toMatchObject({ season: 2019, episode: 5 });
    expect(parseEpisodeName("One Piece S01E1050").episode).toBe(1050);
  });
  it("reads the marker written in words and the 2x03 form", () => {
    expect(parseEpisodeName("The Office Season 2 Episode 3 - Office Olympics")).toMatchObject({ show: "The Office", season: 2, episode: 3 });
    expect(parseEpisodeName("Lost - Season 1 - Ep. 4").episode).toBe(4);
    expect(parseEpisodeName("Lost season 1, ep 7").episode).toBe(7);
    expect(parseEpisodeName("Show 2x03 - Pilot")).toMatchObject({ show: "Show", season: 2, episode: 3, title: "Pilot" });
  });
  it("leaves an unmarked name at season 1, numbered later by its place", () => {
    expect(parseEpisodeName("Tales From The Crypt (1989-90s)")).toEqual({ show: "Tales From The Crypt (1989-90s)", season: 1, episode: 0, title: null });
  });
});

// The cases of the Android app's NumberBlankEpisodesTest and EpisodeOrder.
describe("episode numbers and order", () => {
  const ep = (id: string, season: number, episode: number) => ({ id, season, episode });
  it("numbers a blank episode by its place in its season", () => {
    expect(numberBlankEpisodes([ep("a", 1, 0), ep("b", 1, 0), ep("c", 2, 0), ep("d", 1, 0)]).map((e) => e.episode)).toEqual([1, 2, 1, 3]);
    expect(numberBlankEpisodes([ep("a", 1, 1), ep("b", 1, 2), ep("c", 1, 0), ep("d", 1, 4)]).map((e) => e.episode)).toEqual([1, 2, 3, 4]);
    expect(numberBlankEpisodes([ep("s", 0, 0), ep("a", 1, 5), ep("t", 0, 0)]).map((e) => e.episode)).toEqual([1, 5, 2]);
  });
  it("watches the specials after the last regular season, and knows what comes next", () => {
    const list = [ep("s1", 0, 1), ep("b", 2, 1), ep("a2", 1, 2), ep("a1", 1, 1)];
    expect(inWatchingOrder(list).map((e) => e.id)).toEqual(["a1", "a2", "b", "s1"]);
    expect(seasonsOf(list)).toEqual([1, 2, 0]);
    expect(nextEpisode(list, "a2")?.id).toBe("b");
    expect(nextEpisode(list, "s1")).toBeNull();
  });
  it("counts 95 % as watched and offers to resume from 10 s", () => {
    expect(isWatched(95_000, 100_000)).toBe(true);
    expect(isWatched(94_000, 100_000)).toBe(false);
    expect(canResume(9_000, 100_000)).toBe(false);
    expect(canResume(10_000, 100_000)).toBe(true);
    expect(canResume(96_000, 100_000)).toBe(false);
  });
});

describe("an M3U's films and series", () => {
  it("splits them from the channels, groups episodes into shows and seasons", () => {
    const text = [
      "#EXTM3U",
      '#EXTINF:-1 group-title="Новости",Канал',
      "http://h/live/1.ts",
      '#EXTINF:-1 tvg-logo="http://p/s.jpg" tvg-type="series" group-title="Драмы",Lost S01E02 - Pilot (2)',
      "http://h/s/2.mkv",
      '#EXTINF:-1 tvg-type="series" group-title="Драмы",Lost S01E01',
      "http://h/s/1.mkv",
      '#EXTINF:-1 tvg-type="series" group-title="Драмы",lost S02E01',
      "http://h/s/3.mkv",
      '#EXTINF:-1 tvg-logo="http://p/m.jpg" group-title="Кино",Фильм',
      "http://h/m/1.mp4",
    ].join("\n");
    const lib = m3uLibrary(parseM3U(text));
    expect(lib.movies.map((m) => [m.name, m.category, m.poster])).toEqual([["Фильм", "Кино", "http://p/m.jpg"]]);
    expect(lib.shows).toEqual([{ id: "lost", name: "Lost", category: "Драмы", poster: "http://p/s.jpg" }]);
    expect(lib.episodes.get("lost")?.map((e) => [e.season, e.episode, e.title])).toEqual([[1, 1, ""], [1, 2, "Pilot (2)"], [2, 1, ""]]);
    expect(lib.showCategories).toEqual([{ id: "Драмы", name: "Драмы" }]);
  });
});

// The cases of the Android app's XtreamStreamUrlTest, and the shapes its XtreamClient reads.
describe("Xtream films and series", () => {
  const a = { base: "http://panel.example:8080", user: "alice", pass: "s3cret" };
  it("finds the login in the M3U link and builds the addresses", () => {
    expect(xtreamAccount("http://panel.example:8080/get.php?username=alice&password=s3cret&type=m3u_plus")).toEqual(a);
    expect(xtreamAccount("http://h/playlist.m3u")).toBeNull();
    expect(xtreamMovieUrl(a, "7", "mkv")).toBe("http://panel.example:8080/movie/alice/s3cret/7.mkv");
    expect(xtreamEpisodeUrl(a, "7")).toBe("http://panel.example:8080/series/alice/s3cret/7.mp4");
    expect(xtreamMovieUrl({ ...a, user: "a b", pass: "p#ss/w?rd%1" }, "1", "mp4")).toBe("http://panel.example:8080/movie/a%20b/p%23ss%2Fw%3Frd%251/1.mp4");
    expect(xtreamApiUrl(a, "get_series_info", { series_id: "5" })).toBe("http://panel.example:8080/player_api.php?username=alice&password=s3cret&action=get_series_info&series_id=5");
  });
  it("reads films and shows, with plot, rating, year, the time added", () => {
    const [m] = parseXtreamMovies([{ stream_id: 7, name: "Фильм", stream_icon: "http://p/7.jpg", rating: "7.4", description: "о чём", category_id: "3", container_extension: "mkv", added: "1700000000" }, { name: "без id" }], a);
    expect(m).toEqual({ id: "7", name: "Фильм", category: "3", url: "http://panel.example:8080/movie/alice/s3cret/7.mkv", poster: "http://p/7.jpg", plot: "о чём", rating: 7.4, addedAt: 1700000000000 });
    const [s] = parseXtreamShows([{ series_id: 5, name: "Сериал", cover: "http://p/5.jpg", plot: "сюжет", rating: "0", category_id: "9", year: "2019", last_modified: "1700000001" }]);
    expect(s).toEqual({ id: "5", name: "Сериал", category: "9", poster: "http://p/5.jpg", plot: "сюжет", year: 2019, addedAt: 1700000001000 });
  });
  it("reads episodes keyed by season, as one list, or a list per season", () => {
    const keyed = parseXtreamEpisodes({ episodes: { 2: [{ id: "21", episode_num: 1, title: "B", container_extension: "mkv" }], 1: [{ id: "12", episode_num: 0 }, { id: "11", episode_num: 0 }] } }, a);
    expect(keyed.map((e) => [e.id, e.season, e.episode])).toEqual([["12", 1, 1], ["11", 1, 2], ["21", 2, 1]]);
    expect(keyed[2]?.url).toBe("http://panel.example:8080/series/alice/s3cret/21.mkv");
    const flat = parseXtreamEpisodes({ episodes: [{ id: "1", season: 2, episode_num: 1 }, { id: "2", season: 1, episode_num: 3 }] }, a);
    expect(flat.map((e) => [e.id, e.season])).toEqual([["2", 1], ["1", 2]]);
    const nested = parseXtreamEpisodes({ episodes: [[{ id: "1", episode_num: 1 }], [{ id: "2", episode_num: 1 }]] }, a);
    expect(nested.map((e) => e.season)).toEqual([1, 2]);
    expect(parseXtreamEpisodes({ episodes: null }, a)).toEqual([]);
  });
});
