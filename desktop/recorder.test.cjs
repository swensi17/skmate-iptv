const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePlaylist, fileName } = require("./recorder.cjs");

test("a master playlist gives its variants, the best picture first", () => {
  const p = parsePlaylist("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nlow/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3000000\nhigh/index.m3u8\n", "http://h/live/master.m3u8");
  assert.deepEqual(p.variants.map((v) => v.url), ["http://h/live/high/index.m3u8", "http://h/live/low/index.m3u8"]);
});

test("a media playlist gives its segments with their sequence numbers, the init segment and the end", () => {
  const p = parsePlaylist([
    "#EXTM3U", "#EXT-X-TARGETDURATION:4", "#EXT-X-MEDIA-SEQUENCE:120", '#EXT-X-MAP:URI="init.mp4"',
    "#EXTINF:4.0,", "seg120.m4s", "#EXTINF:4.0,", "seg121.m4s", "#EXT-X-ENDLIST",
  ].join("\n"), "http://h/a/index.m3u8");
  assert.equal(p.target, 4);
  assert.equal(p.init, "http://h/a/init.mp4");
  assert.equal(p.ended, true);
  assert.deepEqual(p.segments, [{ seq: 120, url: "http://h/a/seg120.m4s" }, { seq: 121, url: "http://h/a/seg121.m4s" }]);
});

test("the file is named after the channel and the time, with nothing Windows refuses", () => {
  assert.equal(fileName('Матч: ТВ / "HD"', new Date(2026, 10, 2, 20, 5)), "Матч ТВ HD 2026-11-02 20-05");
});
