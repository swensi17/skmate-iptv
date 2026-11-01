// Recording a live channel to a file, for the Windows app (the TVs' browsers cannot write files). An HLS stream is
// followed playlist by playlist and its segments are appended in order: MPEG-TS segments make a .ts file, fMP4 ones
// an .mp4 with their init segment first. Anything else is saved as it streams. Like the Android app's "Record", it
// stops at the end of the programme on air, or when told to.
const { createWriteStream, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const POLL_MIN_MS = 1_000;

/** The parts of an HLS playlist this needs. Pure, so it is unit-tested. */
function parsePlaylist(text, base) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const abs = (u) => new URL(u, base).toString();
  const variants = [];
  const segments = [];
  let target = 6;
  let sequence = 0;
  let init = null;
  let ended = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("#EXT-X-STREAM-INF:")) {
      const bw = Number(/BANDWIDTH=(\d+)/.exec(l)?.[1] ?? 0);
      const uri = lines[i + 1];
      if (uri && !uri.startsWith("#")) variants.push({ bandwidth: bw, url: abs(uri) });
    } else if (l.startsWith("#EXT-X-TARGETDURATION:")) target = Number(l.split(":")[1]) || target;
    else if (l.startsWith("#EXT-X-MEDIA-SEQUENCE:")) sequence = Number(l.split(":")[1]) || 0;
    else if (l.startsWith("#EXT-X-MAP:")) { const uri = /URI="([^"]+)"/.exec(l)?.[1]; if (uri) init = abs(uri); }
    else if (l === "#EXT-X-ENDLIST") ended = true;
    else if (!l.startsWith("#") && lines[i - 1]?.startsWith("#EXTINF")) segments.push({ seq: sequence + segments.length, url: abs(l) });
  }
  variants.sort((a, b) => b.bandwidth - a.bandwidth);
  return { variants, segments, target, init, ended };
}

/** "Матч ТВ 2026-11-02 20-15" as a file name: no characters Windows refuses. */
function fileName(title, now = new Date()) {
  const safe = (title || "SkMate").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const p = (n) => String(n).padStart(2, "0");
  return `${safe} ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}-${p(now.getMinutes())}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts a recording into [folder]; [onUpdate] hears { state: "recording" | "done" | "failed", bytes, path, error }.
 * Returns { path, stop }.
 */
function record({ url, headers = {}, title, stopAtMs, folder, onUpdate, fetchImpl = fetch, now = Date.now }) {
  mkdirSync(folder, { recursive: true });
  let stopped = false;
  let bytes = 0;
  let path = null;
  let out = null;
  const controller = new AbortController();
  const get = (u) => fetchImpl(u, { headers, signal: controller.signal });
  const due = () => stopped || (stopAtMs && now() >= stopAtMs);
  const open = (ext) => { path = join(folder, `${fileName(title)}.${ext}`); out = createWriteStream(path); };
  const write = (buf) => new Promise((resolve, reject) => {
    bytes += buf.length;
    out.write(buf, (e) => (e ? reject(e) : resolve()));
    onUpdate?.({ state: "recording", bytes, path });
  });
  const finish = (state, error) => new Promise((resolve) => {
    const done = () => { onUpdate?.({ state, bytes, path, error }); resolve(); };
    if (out) out.end(done); else done();
  });

  const run = async () => {
    const first = await get(url);
    if (!first.ok) throw new Error(`HTTP ${first.status}`);
    const type = first.headers.get("content-type") || "";
    const isHls = /\.m3u8(\?|$)/i.test(url) || /mpegurl/i.test(type);
    if (!isHls) {
      open("ts");
      const reader = first.body.getReader();
      while (!due()) {
        const { value, done } = await reader.read();
        if (done) break;
        await write(Buffer.from(value));
      }
      controller.abort();
      return;
    }
    let playlistUrl = url;
    let parsed = parsePlaylist(await first.text(), url);
    if (parsed.variants.length > 0) {
      playlistUrl = parsed.variants[0].url; // the best picture the provider offers
      parsed = parsePlaylist(await (await get(playlistUrl)).text(), playlistUrl);
    }
    open(parsed.init ? "mp4" : "ts");
    if (parsed.init) await write(Buffer.from(await (await get(parsed.init)).arrayBuffer()));
    // A live playlist starts a few segments back: begin with the newest, as a viewer would.
    let next = parsed.ended ? 0 : Math.max(0, (parsed.segments.at(-1)?.seq ?? 0) - 2);
    for (;;) {
      for (const s of parsed.segments) {
        if (s.seq < next || due()) continue;
        const res = await get(s.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await write(Buffer.from(await res.arrayBuffer()));
        next = s.seq + 1;
      }
      if (due() || parsed.ended) return;
      await sleep(Math.max(POLL_MIN_MS, (parsed.target * 1000) / 2));
      if (due()) return;
      parsed = parsePlaylist(await (await get(playlistUrl)).text(), playlistUrl);
    }
  };

  const job = run().then(
    () => finish("done"),
    (e) => (stopped ? finish("done") : finish("failed", String(e && e.message ? e.message : e))),
  );
  return {
    get path() { return path; },
    stop: () => { stopped = true; controller.abort(); return job; },
    done: job,
  };
}

module.exports = { record, parsePlaylist, fileName };
