import { describe, expect, it } from "vitest";
import { behindLive, canStartOver, lagBehind, startOverUrl, windTo, LIVE_EDGE_S } from "./timeshift";

const win = { start: 100, end: 700 }; // ten minutes of picture to wind through

describe("behindLive", () => {
  it("is 0 at the live edge and when nothing is buffered", () => {
    expect(behindLive(win, 700)).toBe(0);
    expect(behindLive(win, 700 - LIVE_EDGE_S)).toBe(0);
    expect(behindLive(null, 5)).toBe(0);
  });
  it("counts the seconds behind once past the edge", () => {
    expect(behindLive(win, 610)).toBe(90);
  });
});

describe("windTo", () => {
  it("winds back and forth by the step", () => {
    expect(windTo(win, 400, -30)).toEqual({ time: 370, atStart: false });
    expect(windTo(win, 400, 30)).toEqual({ time: 430, atStart: false });
  });
  it("stops at the oldest second and says so", () => {
    expect(windTo(win, 110, -30)).toEqual({ time: 100, atStart: true });
  });
  it("never runs into the last seconds that have no data yet", () => {
    expect(windTo(win, 690, 30)).toEqual({ time: 697, atStart: false });
  });
  it("does nothing without a window", () => {
    expect(windTo(null, 5, -30)).toEqual({ time: 5, atStart: false });
  });
});

describe("start over", () => {
  // 2021-01-01 00:00 .. 01:00 UTC, watched at 00:20.
  const start = 1609459200_000;
  const stop = start + 3_600_000;
  const now = start + 1_200_000;
  const archive = { url: "http://x/live.ts", catchupDays: 2, catchupType: "append", catchupSource: "?utc={utc}&lutc={lutc}" };

  it("is offered only for the programme on air of a channel with an archive", () => {
    expect(canStartOver(archive, start, stop, now)).toBe(true);
    expect(canStartOver(archive, start, stop, stop + 1)).toBe(false);
    expect(canStartOver({ url: "http://x/live.ts" }, start, stop, now)).toBe(false);
  });

  it("builds the archive address from the programme's start", () => {
    expect(startOverUrl(archive, start, stop, now)).toBe("http://x/live.ts?utc=1609459200&lutc=1609460400");
  });

  it("uses the panel's timeshift endpoint for an Xtream channel that only gives its days", () => {
    expect(startOverUrl({ url: "http://x:8080/live/u/p/1234.m3u8", catchupDays: 3 }, start, stop, now, "UTC"))
      .toBe("http://x:8080/streaming/timeshift.php?username=u&password=p&stream=1234&start=2021-01-01:00-00&duration=60");
  });

  it("gives nothing when the channel keeps no archive", () => {
    expect(startOverUrl({ url: "http://x/live.ts" }, start, stop, now)).toBeNull();
  });
});

describe("lagBehind", () => {
  const anchor = { wall: 1000, media: 50 };
  it("is 0 while the picture keeps pace with the clock", () => {
    expect(lagBehind(anchor, 1100, 150)).toBe(0);
    expect(lagBehind(null, 1100, 0)).toBe(0);
  });
  it("grows by the length of a pause", () => {
    expect(lagBehind(anchor, 1100, 130)).toBe(20); // 100 s passed, 80 s were played
  });
  it("grows by a wind back and shrinks by a wind forward", () => {
    expect(lagBehind(anchor, 1100, 150 - 30)).toBe(30);
    expect(lagBehind(anchor, 1100, 150 - 30 + 30)).toBe(0);
  });
});
