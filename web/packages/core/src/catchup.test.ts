import { describe, expect, it } from "vitest";
import { archiveUrl, forM3u, fromTemplate, timeshiftPhpAlternate } from "./catchup";

// The same cases as the Android app's CatchupUrlTest, so both build the same archive address.
// 2021-01-01 00:00:00 UTC = 1609459200; +1h = 1609462800.
const start = 1609459200_000;
const end = 1609462800_000;

describe("fromTemplate", () => {
  it("fills the unix tokens", () => {
    expect(fromTemplate("http://x/stream?start=${start}&end=${end}&dur=${duration}", start, end))
      .toBe("http://x/stream?start=1609459200&end=1609462800&dur=3600");
  });

  it("fills {utc} and the date parts", () => {
    expect(fromTemplate("http://x/{Y}-{m}-{d}/{H}-{M}/{utc}.ts", start, end)).toBe("http://x/2021-01-01/00-00/1609459200.ts");
  });

  it("leaves unknown tokens", () => {
    expect(fromTemplate("http://x/${weird}", start, end)).toBe("http://x/${weird}");
  });

  it("reads ${timestamp} as now, as Kodi does", () => {
    const now = 1609466400_000;
    expect(fromTemplate("http://x/s?t=${timestamp}", start, end, now)).toBe("http://x/s?t=1609466400");
    expect(fromTemplate("http://x/s?t={timestamp}", start, end, now)).toBe("http://x/s?t=1609466400");
  });

  it("divides duration and offset, and leaves a bad divisor alone", () => {
    const now = start + 7_200_000;
    expect(fromTemplate("http://x/s?d={duration:60}&o={offset:60}&d2=${duration:60}&o2=${offset:1}", start, end, now))
      .toBe("http://x/s?d=60&o=120&d2=60&o2=7200");
    expect(fromTemplate("http://x/{duration:abc}", start, end, now)).toBe("http://x/{duration:abc}");
    expect(fromTemplate("http://x/{duration:0}", start, end, now)).toBe("http://x/{duration:0}");
  });

  it("formats each instant with its own pattern", () => {
    const s = 1609502461_000; // 2021-01-01 12:01:01 UTC
    const e = 1609506062_000; // 2021-01-01 13:01:02 UTC
    const now = 1609595103_000; // 2021-01-02 13:45:03 UTC
    expect(fromTemplate("http://x/{utc:YmdHMS}", s, e, now)).toBe("http://x/20210101120101");
    expect(fromTemplate("http://x/${start:Ymd-H-M}", s, e, now)).toBe("http://x/20210101-12-01");
    expect(fromTemplate("http://x/{utcend:Ymd-H-M}", s, e, now)).toBe("http://x/20210101-13-01");
    expect(fromTemplate("http://x/${end:Y.m.d_H}", s, e, now)).toBe("http://x/2021.01.01_13");
    expect(fromTemplate("http://x/{lutc:YmdHMS}", s, e, now)).toBe("http://x/20210102134503");
    expect(fromTemplate("http://x/${now:Y-m-d}", s, e, now)).toBe("http://x/2021-01-02");
    expect(fromTemplate("http://x/${timestamp:H:M}", s, e, now)).toBe("http://x/13:45");
    expect(fromTemplate("http://x/{Y}/{m}/{d}/{H}/{M}/{S}", s, e, now)).toBe("http://x/2021/01/01/12/01/01");
    expect(fromTemplate("http://x/{catchup-id:x}", s, e, now)).toBe("http://x/{catchup-id:x}");
  });

  it("fills the now tokens ({lutc} used to reach the provider verbatim)", () => {
    const now = 1609466400_000;
    expect(fromTemplate("http://x/s?utc={utc}&lutc={lutc}&now={now}", start, end, now))
      .toBe("http://x/s?utc=1609459200&lutc=1609466400&now=1609466400");
  });
});

describe("forM3u", () => {
  it("appends onto the live URL", () => {
    expect(forM3u("http://x/live.ts", "append", "?utc=${start}", start, end)).toBe("http://x/live.ts?utc=1609459200");
  });

  it("gives nothing when there is nothing to build from", () => {
    expect(forM3u("http://x/live.ts", undefined, undefined, start, end)).toBeNull();
    expect(forM3u("http://x/live.ts", "vod", undefined, start, end)).toBeNull();
  });

  it("appends the shift query for default, shift and timeshift", () => {
    for (const kind of ["default", "shift", "timeshift"]) {
      expect(forM3u("http://x/live.ts", kind, undefined, start, end)?.startsWith("http://x/live.ts?utc=1609459200&lutc=")).toBe(true);
    }
  });

  it("moves the times by catchup-correction, in every style", () => {
    expect(forM3u("http://x/live.ts", undefined, "http://x/s?start={utc}&end={utcend}", start, end, undefined, -60))
      .toBe("http://x/s?start=1609455600&end=1609459200");
    expect(forM3u("http://x/ch1/index.m3u8", "flussonic", undefined, start, end, undefined, 30))
      .toBe("http://x/ch1/timeshift_abs-1609461000.m3u8");
  });

  it("does not put a second ? on a URL that has a query", () => {
    expect(forM3u("http://x/live.ts?token=abc", "append", "?utc=${start}", start, end)).toBe("http://x/live.ts?token=abc&utc=1609459200");
    expect(forM3u("http://x/live.ts?token=abc", "append", "utc=${start}", start, end)).toBe("http://x/live.ts?token=abc&utc=1609459200");
  });

  it("rewrites a Flussonic path, and does not guess for anything else", () => {
    expect(forM3u("http://x/ch1/index.m3u8", "flussonic", undefined, start, end)).toBe("http://x/ch1/timeshift_abs-1609459200.m3u8");
    expect(forM3u("http://x/ch1/mpegts", "flussonic-ts", undefined, start, end)).toBe("http://x/ch1/archive-1609459200-3600.ts");
    expect(forM3u("http://x", "flussonic", undefined, start, end)).toBeNull();
  });

  it("rebuilds the Xtream timeshift endpoint for xc", () => {
    expect(forM3u("http://x:8080/live/u/p/1234.ts", "xc", undefined, start, end, "UTC"))
      .toBe("http://x:8080/streaming/timeshift.php?username=u&password=p&stream=1234&start=2021-01-01:00-00&duration=60");
  });
});

describe("timeshiftPhpAlternate", () => {
  it("turns the path form into the PHP form", () => {
    expect(timeshiftPhpAlternate("http://gaming8k.top/timeshift/user1/pass1/15/2026-06-16:09-15/544435.ts"))
      .toBe("http://gaming8k.top/streaming/timeshift.php?username=user1&password=pass1&stream=544435&start=2026-06-16:09-15&duration=15");
  });

  it("gives nothing for other URLs", () => {
    expect(timeshiftPhpAlternate("http://x/live/user/pass/1.ts")).toBeNull();
    expect(timeshiftPhpAlternate(null)).toBeNull();
  });
});

describe("legacy ${(b)…} / ${(e)…} tokens", () => {
  // 2026-10-17 14:30:00Z .. 15:00:00Z.
  const acStart = 1792247400_000;
  const acEnd = 1792249200_000;
  const playseek = "?playseek=${(b)yyyyMMddHHmmss}-${(e)yyyyMMddHHmmss}";

  it("fills playseek in UTC", () => {
    expect(forM3u("http://h/cctv1.m3u8", "append", playseek, acStart, acEnd, "UTC"))
      .toBe("http://h/cctv1.m3u8?playseek=20261017143000-20261017150000");
  });

  it("follows the zone unless :utc says otherwise", () => {
    expect(forM3u("http://h/cctv1.m3u8", "append", playseek, acStart, acEnd, "Asia/Shanghai"))
      .toBe("http://h/cctv1.m3u8?playseek=20261017223000-20261017230000");
    expect(forM3u("http://h/cctv1.m3u8", "append", "?playseek=${(b)yyyyMMddHHmmss:utc}-${(e)yyyyMMddHHmmss:utc}", acStart, acEnd, "Asia/Shanghai"))
      .toBe("http://h/cctv1.m3u8?playseek=20261017143000-20261017150000");
  });

  it("reads timestamp, Kodi letters and Java patterns, and leaves a bad pattern", () => {
    expect(fromTemplate("${(b)timestamp}-${(e)timestamp}", acStart, acEnd)).toBe("1792247400-1792249200");
    expect(fromTemplate("${(b)YmdHMS}", acStart, acEnd)).toBe("20261017143000");
    expect(fromTemplate("${(b)yyyyMMddHHmmss}", acStart, acEnd)).toBe("20261017143000");
    expect(fromTemplate("${(b)foo}", acStart, acEnd)).toBe("${(b)foo}");
    expect(fromTemplate("${(b)yyyy'}", acStart, acEnd)).toBe("${(b)yyyy'}");
  });

  it("keeps the colons of a Java pattern, in the given zone or in UTC", () => {
    expect(fromTemplate("${(b)HH:mm}", acStart, acEnd, Date.now(), "Asia/Shanghai")).toBe("22:30");
    expect(fromTemplate("${(b)HH:mm:utc}", acStart, acEnd, Date.now(), "Asia/Shanghai")).toBe("14:30");
  });

  it("keeps the old tokens in UTC when the zone is Shanghai", () => {
    expect(fromTemplate("{utc:YmdHMS}-${(b)yyyyMMddHHmmss}-{utc}-${start}-{duration:60}-{Y}{m}{d}{H}{M}{S}", acStart, acEnd, Date.now(), "Asia/Shanghai"))
      .toBe("20261017143000-20261017223000-1792247400-1792247400-30-20261017143000");
  });
});

describe("archiveUrl", () => {
  const now = end + 3_600_000;
  const xc = { url: "http://x:8080/live/u/p/1234.m3u8", catchupDays: 3 };

  it("opens a past programme within the archive days", () => {
    expect(archiveUrl({ url: "http://x/live.ts", catchupDays: 1, catchupType: "append", catchupSource: "?utc={utc}" }, start, end, now))
      .toBe("http://x/live.ts?utc=1609459200");
  });

  it("keeps nothing still on air, older than the archive, or on a channel without one", () => {
    expect(archiveUrl(xc, start, now + 60_000, now)).toBeNull();
    expect(archiveUrl(xc, start - 4 * 86_400_000, end - 4 * 86_400_000, now)).toBeNull();
    expect(archiveUrl({ url: "http://x/live/u/p/1.ts" }, start, end, now)).toBeNull();
  });

  it("uses the panel's timeshift endpoint when an Xtream channel only gives its days", () => {
    expect(archiveUrl(xc, start, end, now, "UTC"))
      .toBe("http://x:8080/streaming/timeshift.php?username=u&password=p&stream=1234&start=2021-01-01:00-00&duration=60");
    expect(archiveUrl({ url: "http://x/ch/index.m3u8", catchupDays: 3 }, start, end, now)).toBeNull();
  });

  it("applies catchup-correction to the Xtream form too", () => {
    expect(archiveUrl({ ...xc, catchupCorrectionMin: 60 }, start, end, now, "UTC"))
      .toBe("http://x:8080/streaming/timeshift.php?username=u&password=p&stream=1234&start=2021-01-01:01-00&duration=60");
  });
});
