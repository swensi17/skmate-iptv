/*
 * SkMate IPTV for LG and Samsung: the shell installed on the TV (2.7.1). It changes only when this mechanism does.
 *
 * The app runs from the package's own address, where the viewer's data lives (playlists, favourites, the guide in
 * IndexedDB), so a new release is never opened from the web site: its files are fetched once, checked (size and
 * SHA-256 against update.json), kept in IndexedDB and run here, under the same address.
 *
 * - Start: the newest build kept here that is not known bad, else the build inside the package. No network is waited
 *   for. A build that fails to start, or did not hold for HOLD_MS twice, is dropped for the one before it.
 * - Later, quietly: update.json is read; a newer build this shell can run is fetched, checked and kept as the next
 *   start's candidate. Never in the middle of watching.
 * - At most two builds are kept (the one running and the one before it); "Updated to X.Y.Z" is told once, by the app.
 *
 * Written for the oldest TVs (webOS 4 = Chromium 53): no async functions, no crypto.subtle (not on file://).
 */
(function (root) {
  "use strict";
  var SHELL = 1;
  var STATE = "skmate.ota.v1";
  var DB = "skmate-ota";
  var HOLD_MS = 20000;
  var CHECK_AFTER_MS = 45000;
  var SOURCES = ["https://skmate.uz/update.json", "https://swensi17.github.io/skmate-tv/update.json"];
  /**
   * The author's Ed25519 key: update.json is { payload, sig } and only a payload signed by its private half (kept
   * offline by the author, never in git) is ever downloaded or run. A site or domain taken over cannot push code.
   */
  var PUBLIC_KEY = "wH/bZZAXVNmtBjdxZbse/jcicgr9Djc071sEZDLOCyY=";

  function b64(s) { var bin = atob(s); var out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  function utf8(s) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(s);
    var bin = unescape(encodeURIComponent(s)); var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  /** The manifest inside a signed update.json, or null when it is not signed by the author's key. */
  function opened(signed, nacl, key) {
    try {
      if (!signed || typeof signed.payload !== "string" || typeof signed.sig !== "string") return null;
      if (!nacl.sign.detached.verify(utf8(signed.payload), b64(signed.sig), b64(key || PUBLIC_KEY))) return null;
      return JSON.parse(signed.payload);
    } catch (e) { return null; }
  }

  // ---------- state ----------
  function readState(store) {
    try { var s = JSON.parse(store.getItem(STATE) || "null"); if (s && typeof s === "object") return s; } catch (e) { /* new */ }
    return { current: null, previous: null, candidate: null, tries: 0, bad: [] };
  }
  function writeState(store, s) { try { store.setItem(STATE, JSON.stringify(s)); } catch (e) { /* full */ } }

  /** Which kept build to start: the candidate on its first two tries, else the one that held. Null: the package's own. */
  function pick(s) {
    if (s.candidate && s.tries < 2 && s.bad.indexOf(s.candidate.build) < 0) return { build: s.candidate, trial: true };
    if (s.current && s.bad.indexOf(s.current.build) < 0) return { build: s.current, trial: false };
    if (s.previous && s.bad.indexOf(s.previous.build) < 0) return { build: s.previous, trial: false };
    return null;
  }
  /** The candidate held: it is the one in use, the one before it stays as the way back, the rest can go. */
  function promote(s) {
    if (!s.candidate) return s;
    return { current: s.candidate, previous: s.current || s.previous, candidate: null, tries: 0, bad: s.bad, told: false };
  }
  /** A build failed to start: never again; the next start takes the one before it. */
  function fail(s, build) {
    var bad = s.bad.slice(-9);
    if (bad.indexOf(build) < 0) bad.push(build);
    var n = { current: s.current, previous: s.previous, candidate: s.candidate, tries: 0, bad: bad };
    if (n.candidate && n.candidate.build === build) n.candidate = null;
    if (n.current && n.current.build === build) { n.current = n.previous; n.previous = null; }
    if (n.previous && n.previous.build === build) n.previous = null;
    return n;
  }
  /** Whether [m] (an update.json) is newer than what runs and is meant for this shell. */
  function wanted(m, s, running) {
    if (!m || typeof m.build !== "number" || !m.files || !m.entry || !m.polyfills) return false;
    if ((m.minShell || 1) > SHELL) return false;
    if (s.bad.indexOf(m.build) >= 0) return false;
    if (s.candidate && s.candidate.build >= m.build) return false;
    return m.build > (running || 0);
  }

  // ---------- SHA-256 (no crypto.subtle on file:// in old TVs) ----------
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256(buf) {
    var bytes = new Uint8Array(buf);
    var len = bytes.length;
    var words = ((len + 9 + 63) >> 6) << 4;
    var w = new Uint32Array(words);
    for (var i = 0; i < len; i++) w[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
    w[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
    w[words - 1] = len * 8;
    w[words - 2] = Math.floor(len / 0x20000000);
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var m = new Uint32Array(64);
    for (var off = 0; off < words; off += 16) {
      for (var t = 0; t < 16; t++) m[t] = w[off + t];
      for (t = 16; t < 64; t++) {
        var x = m[t - 15], y = m[t - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        m[t] = (m[t - 16] + s0 + m[t - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (k + S1 + ch + K[t] + m[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + k) | 0;
    }
    var out = "";
    for (i = 0; i < 8; i++) out += ("00000000" + (h[i] >>> 0).toString(16)).slice(-8);
    return out;
  }

  /**
   * The text of a stylesheet or script with every asset it names by file name pointed at [urls] (the kept copies):
   * "./assets/name", "assets/name" and a bare "name" inside url() or quotes.
   */
  function rewrite(text, urls) {
    return text.replace(/(["'(])((?:\.\/|\.\.\/)?(?:assets\/)?)([\w.-]+\.(?:woff2?|ttf|otf|png|jpe?g|svg|webp|gif|css|json))(?=["')?#])/g,
      function (all, open, prefix, name) { return urls[name] ? open + urls[name] : all; });
  }

  // ---------- IndexedDB ----------
  function db() {
    return new Promise(function (ok, no) {
      var r = root.indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("files"); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { no(r.error); };
    });
  }
  function tx(d, mode, fn) {
    return new Promise(function (ok, no) {
      var t = d.transaction("files", mode);
      var out = fn(t.objectStore("files"));
      t.oncomplete = function () { ok(out && out.result !== undefined ? out.result : out); };
      t.onerror = function () { no(t.error); };
      t.onabort = function () { no(t.error); };
    });
  }
  function getFile(d, key) { return tx(d, "readonly", function (s) { return s.get(key); }); }
  function putFiles(d, build, files) {
    return tx(d, "readwrite", function (s) { for (var n in files) s.put(files[n], build + "/" + n); });
  }
  /** Removes every kept file but those of [keep] (builds). */
  function prune(d, keep) {
    return tx(d, "readwrite", function (s) {
      var c = s.openCursor();
      c.onsuccess = function () {
        var cur = c.result;
        if (!cur) return;
        if (keep.indexOf(Number(String(cur.key).split("/")[0])) < 0) cur.delete();
        cur.continue();
      };
    });
  }

  // ---------- starting a build ----------
  function addScript(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement("script");
      s.src = src; s.onload = function () { ok(); }; s.onerror = function () { no(new Error("script " + src)); };
      document.body.appendChild(s);
    });
  }
  function addCss(href) {
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l);
  }
  /** Starts a build from [m] (its manifest); [urlOf](name) gives each file's address. */
  function start(m, urlOf) {
    (m.css || []).forEach(function (n) { addCss(urlOf(n)); });
    return addScript(urlOf(m.polyfills)).then(function () {
      var System = root.System;
      var proto = System.constructor.prototype;
      var resolve = proto.resolve;
      var context = proto.createContext;
      var nameOf = {};
      for (var n in m.files) { var u0 = urlOf(n); if (u0) nameOf[u0] = n; }
      // A kept copy lives at a blob: address, which cannot be the base of new URL(...). Its import.meta.url is the
      // address the file would have in the package; what it names was written in as kept copies already.
      proto.createContext = function (url) {
        var c = context.call(this, url);
        if (nameOf[url] && /^blob:/.test(url)) c.url = new URL(m.path + nameOf[url], root.location.href).href;
        return c;
      };
      // Chunks ask for each other by "./assets/name": answered with the kept copy of that name.
      proto.resolve = function (id, parent) {
        var name = String(id).split("/").pop().split("?")[0];
        var u = urlOf(name);
        return u && m.files[name] ? u : resolve.call(this, id, parent);
      };
      return System.import(urlOf(m.entry));
    });
  }
  /** The kept files of [build] as blob addresses, stylesheets and scripts pointed at their kept assets. */
  function blobsOf(d, m) {
    var names = Object.keys(m.files);
    var urls = {};
    var plain = names.filter(function (n) { return !/\.(js|css)$/.test(n); });
    var styles = names.filter(function (n) { return /\.css$/.test(n); });
    var scripts = names.filter(function (n) { return /\.js$/.test(n); });
    function texts(list) {
      return Promise.all(list.map(function (n) {
        return getFile(d, m.build + "/" + n).then(function (b) {
          if (!b) throw new Error("missing " + n);
          return new Response(b).text().then(function (text) {
            urls[n] = URL.createObjectURL(new Blob([rewrite(text, urls)], { type: /\.css$/.test(n) ? "text/css" : "text/javascript" }));
          });
        });
      }));
    }
    // Pictures and fonts first, then the stylesheets that name them, then the scripts that name both. Scripts name
    // other scripts through System.resolve (see start), never written in.
    return Promise.all(plain.map(function (n) {
      return getFile(d, m.build + "/" + n).then(function (b) { if (!b) throw new Error("missing " + n); urls[n] = URL.createObjectURL(b); });
    })).then(function () { return texts(styles); }).then(function () { return texts(scripts); }).then(function () { return urls; });
  }

  // ---------- fetching an update ----------
  function getJson(urls, i) {
    i = i || 0;
    if (i >= urls.length) return Promise.resolve(null);
    return fetch(urls[i] + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (m) { return m || getJson(urls, i + 1); });
  }
  function download(m, base) {
    var files = {};
    var names = Object.keys(m.files);
    var at = 0;
    function next() {
      if (at >= names.length) return Promise.resolve(files);
      var n = names[at++];
      var want = m.files[n];
      return fetch(base + m.path + n, { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("http " + r.status + " " + n);
        return r.arrayBuffer();
      }).then(function (buf) {
        if (buf.byteLength !== want.size || sha256(buf) !== want.sha256) throw new Error("check " + n);
        files[n] = new Blob([buf]);
        return next();
      });
    }
    return next();
  }

  // ---------- boot ----------
  function boot() {
    var store = root.localStorage;
    var s = readState(store);
    var embedded = root.__SKMATE_EMBEDDED__;
    var chosen = pick(s);
    var running = embedded.build;
    var dbp = root.indexedDB ? db() : Promise.reject(new Error("no indexedDB"));

    function fromPackage() {
      running = embedded.build;
      return start(embedded, function (n) { return embedded.files[n] ? new URL(embedded.path + n, root.location.href).href : null; });
    }
    var started = chosen && chosen.build.build > embedded.build
      ? dbp.then(function (d) {
        return getFile(d, chosen.build.build + "/@manifest").then(function (mb) {
          if (!mb) throw new Error("no manifest");
          return new Response(mb).text().then(function (t) {
            var m = opened(JSON.parse(t), root.nacl);
            if (!m || m.build !== chosen.build.build) throw new Error("kept manifest not signed");
            if (chosen.trial) {
              s.tries += 1; writeState(store, s);
              // Told once by the app on this start: "Updated to X.Y.Z".
              if (s.tries === 1) { try { store.setItem("skmate.ota.updated", chosen.build.version); } catch (e) { /* full */ } }
            }
            return blobsOf(d, m).then(function (urls) {
              running = m.build;
              return start(m, function (n) { return urls[n] || null; });
            });
          });
        });
      }).catch(function (e) {
        // The kept build would not start: it is dropped, and the package's own build runs now.
        s = fail(s, chosen.build.build); writeState(store, s);
        try { console.warn("skmate shell: kept build failed", e); } catch (x) { /* no console */ }
        return fromPackage();
      })
      : fromPackage();

    started.then(function () {
      setTimeout(function () {
        s = readState(store);
        if (chosen && chosen.trial && running === chosen.build.build) {
          s = promote(s);
          writeState(store, s);
        }
        dbp.then(function (d) {
          var keep = [s.current && s.current.build, s.previous && s.previous.build, s.candidate && s.candidate.build].filter(Boolean);
          return prune(d, keep);
        }).catch(function () { /* nothing kept */ });
      }, HOLD_MS);
      setTimeout(function () { check(running); }, Number(store.getItem("skmate.ota.checkAfter")) || CHECK_AFTER_MS);
    }).catch(function (e) { try { console.error("skmate shell: start failed", e); } catch (x) { /* no console */ } });

    function check(run) {
      if (store.getItem("skmate.ota.off") === "1") return;
      // A test or a mirror may name another address (never needed by viewers).
      var own = store.getItem("skmate.ota.source");
      var sources = own ? [own] : SOURCES;
      getJson(sources).then(function (signed) {
        var m = opened(signed, root.nacl);
        var s2 = readState(store);
        if (!wanted(m, s2, Math.max(run, (s2.current && s2.current.build) || 0))) return null;
        var base = sources[0].replace(/update\.json(\?.*)?$/, "");
        var other = (sources[1] || sources[0]).replace(/update\.json(\?.*)?$/, "");
        return download(m, base).catch(function () { return download(m, other); }).then(function (files) {
          files["@manifest"] = new Blob([JSON.stringify(signed)]);
          return dbp.then(function (d) { return putFiles(d, m.build, files); }).then(function () {
            var s3 = readState(store);
            s3.candidate = { build: m.build, version: m.version };
            s3.tries = 0;
            writeState(store, s3);
          });
        });
      }).catch(function () { /* tried again at the next start */ });
    }
  }

  root.__skmateShell = { SHELL: SHELL, opened: opened, readState: readState, pick: pick, promote: promote, fail: fail, wanted: wanted, sha256: sha256, rewrite: rewrite };
  if (!root.__SKMATE_TEST__ && root.document) boot();
})(typeof window !== "undefined" ? window : globalThis);
