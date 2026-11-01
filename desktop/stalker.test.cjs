// The cases of the Android app's StalkerClientTest and StalkerAuthManagerTest, and a fake Ministra portal that
// answers only a MAG box: the whole way from a MAC to a playable address, a guide and an archive.
const test = require("node:test");
const assert = require("node:assert/strict");
const s = require("./stalker.cjs");

test("MAC: any spelling becomes AA:BB:CC:DD:EE:FF, letters past F are allowed, wrong lengths are not", () => {
  assert.equal(s.canonicalizeMac("001a79aabbcc"), "00:1A:79:AA:BB:CC");
  assert.equal(s.canonicalizeMac("00:1a:79:aa:bb:cc"), "00:1A:79:AA:BB:CC");
  assert.equal(s.canonicalizeMac("00-1A-79-AA-BB-CC"), "00:1A:79:AA:BB:CC");
  assert.equal(s.canonicalizeMac(" 00.1a.79.aa.bb.cc "), "00:1A:79:AA:BB:CC");
  assert.equal(s.canonicalizeMac("00:1a:79:aa:bb:pq"), "00:1A:79:AA:BB:PQ");
  assert.equal(s.canonicalizeMac("zzzzzzzzzzzz"), "ZZ:ZZ:ZZ:ZZ:ZZ:ZZ");
  for (const bad of ["001a79aabbc", "001a79aabbccdd", "001&79aabbcc", ""]) assert.equal(s.canonicalizeMac(bad), null);
});

test("portal address: the /c/ page is dropped, endpoints are tried in Android's order", () => {
  for (const u of ["http://host:8080/c/", "http://host:8080/c", "http://host:8080/", "http://host:8080"]) assert.equal(s.portalRoot(u), "http://host:8080");
  assert.deepEqual(s.apiCandidates("http://host:8080/c/"), [
    "http://host:8080/portal.php", "http://host:8080/stalker_portal/server/load.php", "http://host:8080/server/load.php",
  ]);
  const direct = s.apiCandidates("http://host:8080/portal.php");
  assert.equal(direct[0], "http://host:8080/portal.php");
  assert.equal(direct.slice(1).includes("http://host:8080/portal.php"), false);
  assert.ok(s.isValidPortalUrl("http://host:8080/c/"));
  assert.ok(s.isValidPortalUrl("https://portal.example.com"));
  assert.equal(s.isValidPortalUrl("host:8080/c/"), false);
  assert.equal(s.isValidPortalUrl(""), false);
});

test("cmd: prefixes go, a real address plays as it is, a localhost placeholder needs create_link", () => {
  assert.equal(s.stripCmdPrefix("ffmpeg http://real/play/index.m3u8?token=X"), "http://real/play/index.m3u8?token=X");
  for (const p of ["auto", "ffrt2", "ffrt3", "ffrt"]) assert.equal(s.stripCmdPrefix(`${p} http://real/1.ts`), "http://real/1.ts");
  assert.equal(s.stripCmdPrefix("  http://real/1.ts  "), "http://real/1.ts");
  assert.ok(s.isDirectPlayUrl("http://host:80/play/live.php?mac=00:1A:79:1C:F8:46&stream=1745079&extension=ts&play_token=abc"));
  assert.ok(s.isDirectPlayUrl("http://host/live/1.ts"));
  assert.equal(s.isDirectPlayUrl("http://localhost/ch/12345_"), false);
  assert.equal(s.isDirectPlayUrl("http://127.0.0.1/ch/12345_0"), false);
});

test("archive flags and length, session length and refusals, as on Android", () => {
  assert.ok(s.hasArchive({ enable_tv_archive: "1" }));
  assert.ok(s.hasArchive({ archive: "1" }));
  assert.ok(s.hasArchive({ tv_archive: "1" }));
  assert.equal(s.hasArchive({ enable_tv_archive: "0" }), false);
  assert.deepEqual([24, 48, 72, 168, 7, 0].map((h) => s.archiveDays(String(h))), [1, 2, 3, 7, 7, 0]);
  const d = 5 * 60_000;
  for (const w of [undefined, "", "not a number", "0", "-120"]) assert.equal(s.sessionTtlMs({ watchdog_timeout: w }), d);
  assert.equal(s.sessionTtlMs({ watchdog_timeout: " 120 " }), 120_000);
  assert.equal(s.sessionTtlMs({ watchdog_timeout: "10" }), 60_000);
  assert.equal(s.sessionTtlMs({ watchdog_timeout: "86400" }), 15 * 60_000);
  assert.equal(s.profileRefusal({ status: "1", msg: "Device conflict - device_id mismatch" }), "Device conflict - device_id mismatch");
  assert.equal(s.profileRefusal({ status: "1", block_msg: "Blocked" }), "Blocked");
  assert.equal(s.profileRefusal({ id: "1439338", status: "0" }), null);
  assert.equal(s.profileRefusal({ status: "0", msg: "", block_msg: " " }), null);
  assert.throws(() => s.unwrap('{"js":false}'), s.AuthError);
  assert.throws(() => s.unwrap("<html>"), /not JSON/);
});

test("the portal guide: both shapes, epoch seconds or the wall clock", () => {
  const keyed = s.guideOf({ data: { 7: [{ name: "Новости", start_timestamp: "1700000000", stop_timestamp: "1700001800" }] } });
  assert.deepEqual(keyed, [{ ch: "7", start: 1700000000000, stop: 1700001800000, title: "Новости", descr: null }]);
  const flat = s.guideOf([{ ch_id: "8", name: "Кино", time: "2026-11-02 20:00:00", time_to: "2026-11-02 21:30:00", descr: "о" }]);
  assert.equal(flat[0].ch, "8");
  assert.equal(flat[0].stop - flat[0].start, 90 * 60_000);
});

/** A Ministra portal at portal.php that answers only what a MAG box sends; create_link mints a new token each time. */
function fakePortal({ mac = "00:1A:79:AA:BB:CC", noAllChannels = false } = {}) {
  const seen = { handshakes: 0, links: 0, headers: null };
  let token = null;
  const json = (js) => new Response(JSON.stringify({ js }), { status: 200 });
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const h = init.headers;
    seen.headers = h;
    if (!u.pathname.endsWith("/portal.php")) return new Response("no", { status: 404 });
    if (!/MAG200/.test(h["User-Agent"]) || !h.Cookie.includes(`mac=${encodeURIComponent(mac)}`) || !h.Referer.endsWith("/c/")) return json(false);
    const q = u.searchParams;
    const action = `${q.get("type")}/${q.get("action")}`;
    if (action === "stb/handshake") { seen.handshakes++; token = `T${seen.handshakes}`; return json({ token }); }
    if (h.Authorization !== `Bearer ${token}`) return json(false);
    switch (action) {
      case "stb/get_profile": return json({ id: "42", status: "0", watchdog_timeout: "120" });
      case "itv/get_genres": return json([{ id: "1", title: "Новости" }, { id: "2", title: "Кино" }]);
      case "itv/get_all_channels":
        if (noAllChannels) return json(false);
        return json({ data: [
          { id: "7", name: "Первый", number: "1", cmd: "ffrt http://localhost/ch/7_", tv_genre_id: "1", xmltv_id: "first.ru", enable_tv_archive: "1", tv_archive_duration: "72", logo: "http://logo/7.png" },
          { id: "8", name: "Кино ТВ", cmd: "ffmpeg http://cdn.example/live/8.m3u8?t=1", tv_genre_id: "2" },
        ] });
      case "itv/get_ordered_list":
        return json(q.get("genre") === "1"
          ? { total_items: 1, max_page_items: 14, data: [{ id: "7", name: "Первый", cmd: "ffrt http://localhost/ch/7_", tv_genre_id: "1" }] }
          : { total_items: 0, max_page_items: 14, data: [] });
      case "itv/create_link": seen.links++; return json({ cmd: `ffmpeg http://cdn.example/live/${q.get("cmd").match(/ch\/(\d+)/)[1]}.m3u8?token=L${seen.links}` });
      case "tv_archive/create_link": return json({ cmd: `auto http://cdn.example/archive/${encodeURIComponent(q.get("cmd"))}` });
      case "itv/get_epg_info": return json({ data: { 7: [{ name: "Новости", start_timestamp: "1700000000", stop_timestamp: "1700001800" }] } });
      case "epg/get_simple_data_table":
        return json({ total_items: 1, max_page_items: 10, data: [{ id: "555", start_timestamp: "1700000000", stop_timestamp: "1700001800" }] });
      default: return json(false);
    }
  };
  return { fetchImpl, seen, expire: () => { token = "dead"; } };
}

test("a portal account: MAG headers, the channel list with categories, links, a token that dies and comes back", async () => {
  const fake = fakePortal();
  const a = s.portal({ url: "http://portal.example:8080/c/", mac: "00:1A:79:AA:BB:CC", fetchImpl: fake.fetchImpl, timeZone: "Europe/Moscow" });
  const { channels, genres } = await a.channels();
  assert.equal(channels.length, 2);
  assert.deepEqual(genres.map((g) => g.title), ["Новости", "Кино"]);
  assert.equal(fake.seen.headers["X-User-Agent"], "Model: MAG250; Link: WiFi");
  assert.match(fake.seen.headers.Cookie, /timezone=Europe\/Moscow/);
  assert.equal(await a.link("ffrt http://localhost/ch/7_"), "http://cdn.example/live/7.m3u8?token=L1");
  assert.equal(await a.link("ffmpeg http://cdn.example/live/8.m3u8?t=1"), "http://cdn.example/live/8.m3u8?t=1"); // plays as it is
  fake.expire();
  assert.equal(await a.link("ffrt http://localhost/ch/7_"), "http://cdn.example/live/7.m3u8?token=L2");
  assert.equal(fake.seen.handshakes, 2); // one fresh handshake, not a storm
  assert.equal(await a.archive("7", 1700000000000, 1700001800000), `http://cdn.example/archive/${encodeURIComponent("auto /media/555.mpg")}`);
});

test("a portal without get_all_channels is walked genre by genre", async () => {
  const fake = fakePortal({ noAllChannels: true });
  const a = s.portal({ url: "http://portal.example:8080/c/", mac: "00:1A:79:AA:BB:CC", fetchImpl: fake.fetchImpl });
  const { channels } = await a.channels();
  assert.deepEqual(channels.map((c) => c.id), ["7"]);
});

test("a MAC the portal does not know is an AuthError", async () => {
  const fake = fakePortal({ mac: "11:22:33:44:55:66" });
  const a = s.portal({ url: "http://portal.example:8080/c/", mac: "00:1A:79:AA:BB:CC", fetchImpl: fake.fetchImpl });
  await assert.rejects(a.channels(), s.AuthError);
});

test("the local server: M3U, XMLTV, a redirect to a fresh link, 401 for a refused MAC", async () => {
  const fake = fakePortal();
  const hosts = [];
  const { server, base, sourceKey } = await s.startServer({ fetchImpl: fake.fetchImpl, onStreamHost: (h) => hosts.push(h) });
  try {
    const key = sourceKey("stalker:http://portal.example:8080/c/#mac=00:1A:79:AA:BB:CC");
    const m3u = await (await fetch(`${base}/s/${key}/playlist.m3u`)).text();
    assert.match(m3u, new RegExp(`^#EXTM3U url-tvg="${base}/s/${key}/guide.xml"`));
    assert.match(m3u, /tvg-id="first.ru".*group-title="Новости" catchup="default" catchup-days="3" catchup-source="[^"]+\/archive\/7\?start=\{utc\}&end=\{utcend\}",Первый/);
    assert.match(m3u, /group-title="Кино",Кино ТВ/);
    const live = m3u.split("\n").find((l) => l.includes("/live/7?"));
    const r = await fetch(live, { redirect: "manual" });
    assert.equal(r.status, 302);
    assert.match(r.headers.get("location"), /^http:\/\/cdn\.example\/live\/7\.m3u8\?token=L\d$/);
    assert.deepEqual(hosts, ["cdn.example"]);
    const xml = await (await fetch(`${base}/s/${key}/guide.xml`)).text();
    assert.match(xml, /<channel id="first.ru">/);
    assert.match(xml, /<programme start="20231114221320 \+0000" stop="20231114224320 \+0000" channel="first.ru"><title>Новости<\/title>/);
    const arch = await fetch(`${base}/s/${key}/archive/7?start=1700000000&end=1700001800`, { redirect: "manual" });
    assert.equal(arch.status, 302);
    const wrong = sourceKey("stalker:http://portal.example:8080/c/#mac=11:22:33:44:55:66");
    assert.equal((await fetch(`${base}/s/${wrong}/playlist.m3u`)).status, 401);
    assert.equal((await fetch(`${base}/s/${sourceKey("nonsense")}/playlist.m3u`)).status, 400);
  } finally {
    server.close();
  }
});
