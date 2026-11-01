// The cases of the Android app's CompanionHttpServerTest and CompanionLinkTest, and the server itself: the PIN
// gate, a playlist sent from a "phone", the lock after ten wrong PINs, a backup sent and taken between two apps.
const test = require("node:test");
const assert = require("node:assert/strict");
const c = require("./companion.cjs");

const S = new Proxy({}, { get: (_t, k) => `[${String(k)}]` }); // every page string shows its own name

test("PIN: equal and the same length only", () => {
  assert.ok(c.pinEquals("123456", "123456"));
  assert.equal(c.pinEquals("123456", "123457"), false);
  assert.equal(c.pinEquals("12345", "123456"), false);
  assert.equal(c.pinEquals("", "123456"), false);
  assert.match(c.newPin(), /^\d{6}$/);
});

test("forms: pairs, plus as a space, Android's required fields for each kind", () => {
  assert.deepEqual(c.parseQuery("a=1&b=hello+world&c="), { a: "1", b: "hello world", c: "" });
  const form = "application/x-www-form-urlencoded";
  const x = c.parsePayload(form, "type=xtream&name=My+IPTV&server=http%3A%2F%2Fh%3A80&user=u&pass=p", "xtream");
  assert.deepEqual([x.type, x.name, x.server, x.user, x.pass], ["xtream", "My IPTV", "http://h:80", "u", "p"]);
  assert.equal(c.parsePayload(form, "type=xtream&server=http://h", "xtream"), null);
  const m = c.parsePayload(form, "url=http%3A%2F%2Fx%2Fp.m3u&name=P", "m3u");
  assert.deepEqual([m.type, m.server, m.name], ["m3u", "http://x/p.m3u", "P"]);
  assert.equal(c.parsePayload(form, "type=m3u&name=P", "m3u"), null);
  const file = c.parsePayload("application/json", JSON.stringify({ type: "m3u", playlistFile: "#EXTM3U\n#EXTINF:-1,A\nhttp://a\n", playlistFileName: "drm-test.m3u" }), "m3u");
  assert.ok(file.playlistContent.startsWith("#EXTM3U"));
  assert.equal(file.playlistFileName, "drm-test.m3u");
  assert.equal(file.server, "");
  assert.equal(c.parsePayload("application/json", '{"type":"m3u","playlistFile":"  "}', "m3u"), null);
  assert.equal(c.parsePayload("application/json", "{not json", "m3u"), null);
  assert.equal(c.parsePayload(form, "portalUrl=http://p/c/", "stalker"), null);
  assert.equal(c.parsePayload(form, "portalUrl=http://p/c/&mac=00:1A:79:AA:BB:CC", "stalker").mac, "00:1A:79:AA:BB:CC");
});

test("addresses: private ranges first, loopback only when there is nothing else, the port kept", () => {
  for (const h of ["10.0.0.5", "192.168.1.42", "172.16.0.1", "172.31.255.254"]) assert.ok(c.isPrivateLan(h), h);
  for (const h of ["8.8.8.8", "172.15.0.1", "172.32.0.1", "127.0.0.1"]) assert.equal(c.isPrivateLan(h), false, h);
  const ifs = { eth: [{ family: "IPv4", internal: false, address: "8.8.4.4" }], wifi: [{ family: "IPv4", internal: false, address: "192.168.1.7" }], lo: [{ family: "IPv4", internal: true, address: "127.0.0.1" }] };
  assert.deepEqual(c.lanUrls(8089, ifs), ["http://192.168.1.7:8089/", "http://8.8.4.4:8089/"]);
  assert.deepEqual(c.lanUrls(9000, {}), ["http://127.0.0.1:9000/"]);
  assert.equal(c.syncBase("192.168.1.5"), "http://192.168.1.5:8089");
  assert.equal(c.syncBase("http://192.168.1.5:9000/"), "http://192.168.1.5:9000");
  assert.equal(c.syncBase(""), null);
});

test("add mode: the gate, a wrong PIN, the form, a playlist file sent, a direct POST without the PIN refused", async () => {
  const got = [];
  const srv = await c.startCompanion({ mode: "add", strings: S, port: 0, host: "127.0.0.1", pin: "246810", onPayload: (p) => got.push(p) });
  const base = `http://127.0.0.1:${srv.port}`;
  try {
    assert.match(await (await fetch(`${base}/`)).text(), /\[pinHeading\]/);
    const wrong = await (await fetch(`${base}/`, { method: "POST", body: "pin=111111", headers: { "Content-Type": "application/x-www-form-urlencoded" } })).text();
    assert.match(wrong, /\[pinMismatch\]/);
    const form = await (await fetch(`${base}/`, { method: "POST", body: "pin=246810", headers: { "Content-Type": "application/x-www-form-urlencoded" } })).text();
    assert.match(form, /action="\/m3u\?pin=246810"/);
    assert.match(form, /data-k="stalker"/);
    assert.equal((await fetch(`${base}/m3u`, { method: "POST", body: "server=http://x/p.m3u" })).status, 401);
    const sent = await fetch(`${base}/m3u?pin=246810`, { method: "POST", body: "server=&playlistFileName=my.m3u&playlistFile=%23EXTM3U%0A%23EXTINF%3A-1%2CA%0Ahttp%3A%2F%2Fa%0A", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    assert.equal(sent.status, 200);
    assert.match(await sent.text(), /\[savedHeading\]/);
    assert.equal(got.length, 1);
    assert.equal(got[0].playlistFileName, "my.m3u");
    assert.equal(got[0].playlistContent, "#EXTM3U\n#EXTINF:-1,A\nhttp://a\n");
    const xt = await fetch(`${base}/xtream`, { method: "POST", body: "server=http://h&user=u&pass=p", headers: { "X-Companion-Pin": "246810", "Content-Type": "application/x-www-form-urlencoded" } });
    assert.equal(xt.status, 200);
    assert.equal(got[1].type, "xtream");
    assert.equal((await fetch(`${base}/xtream?pin=246810`, { method: "POST", body: "server=http://h" })).status, 400);
  } finally { await srv.close(); }
});

test("ten wrong PINs close the server", async () => {
  let locked = false;
  const srv = await c.startCompanion({ mode: "add", strings: S, port: 0, host: "127.0.0.1", pin: "246810", onLocked: () => { locked = true; } });
  const base = `http://127.0.0.1:${srv.port}`;
  await Promise.all(Array.from({ length: c.MAX_PIN_ATTEMPTS }, () => fetch(`${base}/?pin=000000`).then((r) => r.text())));
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(locked);
  await assert.rejects(fetch(`${base}/`));
});

test("sync mode: a backup sent and one taken, a wrong PIN refused, nothing there is unreachable", async () => {
  const received = [];
  const srv = await c.startCompanion({ mode: "sync", strings: S, port: 0, host: "127.0.0.1", pin: "135790", backup: '{"app":"skmate-web","version":1}', onBackup: (b) => { received.push(b); return true; } });
  const address = `127.0.0.1:${srv.port}`;
  try {
    assert.match(await (await fetch(`http://${address}/`)).text(), /\[syncBody\]/);
    assert.deepEqual(await c.syncRequest(address, "135790", "POST", '{"app":"skmate-web","version":1,"items":{}}'), { text: '{"ok":true}' });
    assert.equal(received.length, 1);
    assert.deepEqual(await c.syncRequest(address, "135790", "GET"), { text: '{"app":"skmate-web","version":1}' });
    assert.deepEqual(await c.syncRequest(address, "000000", "GET"), { error: "unauthorized" });
  } finally { await srv.close(); }
  assert.deepEqual(await c.syncRequest(address, "135790", "GET"), { error: "unreachable" });
});
