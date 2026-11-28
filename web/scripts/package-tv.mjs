// Packs the built web app (apps/tv/dist) for the televisions, into web/release/:
//   SkMate-IPTV-web-vX.Y.Z.zip      the app for any web server (GitHub Pages, a NAS, a hosted TV app)
//   SkMate-IPTV-tizen-vX.Y.Z.wgt    Samsung Tizen widget, unsigned: sign it with your own Samsung
//                                   certificate (Tizen Studio) before it installs on a TV
//   webos/                          the webOS app folder; `ares-package --no-minify web/release/webos` turns it into an .ipk
//                                   (--no-minify: the packer would otherwise rewrite the built code)
// The version comes from apps/tv/package.json and is written into config.xml and appinfo.json here,
// so the three never disagree. Source maps, tests and dev files never get in: only dist and the icons.
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, cpSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { createHash, createPrivateKey, sign } from "node:crypto";
import { homedir } from "node:os";

const web = fileURLToPath(new URL("..", import.meta.url));
const app = join(web, "apps/tv");
const dist = join(app, "dist");
const platform = join(app, "platform");
const out = join(web, "release");
const version = JSON.parse(readFileSync(join(app, "package.json"), "utf8")).version;

if (!statSync(dist, { throwIfNoEntry: false })?.isDirectory()) {
  console.error("apps/tv/dist is missing: run `npm run build` first");
  process.exit(1);
}

/** Every file under [dir] as zip entries, with paths relative to [dir]. */
function files(dir, base = dir, into = {}) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, base, into);
    else if (!name.endsWith(".map") && name !== ".DS_Store") into[relative(base, p).split("\\").join("/")] = readFileSync(p);
  }
  return into;
}

// ---- Updates over the air (2.7.1): the shell on the TV runs the newest build it has checked (platform/shell) ----
// On a TV the app runs from file://, where it always takes the legacy (SystemJS) build: that build is what is shipped.
const html = readFileSync(join(dist, "index.html"), "utf8");
const pick = (re) => { const m = html.match(re); if (!m) { console.error("index.html: not found " + re); process.exit(1); } return m[1].replace(/^\.\/assets\//, ""); };
const polyfills = pick(/id="vite-legacy-polyfill" src="([^"]+)"/);
const entry = pick(/id="vite-legacy-entry" data-src="([^"]+)"/);
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.\/assets\/([^"]+)"/g)].map((m) => m[1]);
const assets = readdirSync(join(dist, "assets")).filter((n) => !n.endsWith(".map") && (!n.endsWith(".js") || n.includes("-legacy")));
const build = JSON.parse(readFileSync(join(dist, "version.json"), "utf8")).build;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const filesOf = {};
for (const n of assets) { const b = readFileSync(join(dist, "assets", n)); filesOf[n] = { size: b.length, sha256: sha(b) }; }
const manifest = { version, build, minShell: 1, path: "assets/", polyfills, entry, css, files: filesOf };
// Read by installed shells from the site (skmate.uz / GitHub Pages): what the newest build is and how to check it,
// signed with the author's Ed25519 key (kept outside git; SKMATE_OTA_KEY or ~/dev/skmate-secrets/ota/ota-ed25519.pem).
// Without the key no package is made: a shell runs nothing unsigned, and an unsigned release would never update.
const keyPath = process.env.SKMATE_OTA_KEY || join(homedir(), "dev/skmate-secrets/ota/ota-ed25519.pem");
if (!statSync(keyPath, { throwIfNoEntry: false })) { console.error(`update signing key not found: ${keyPath}`); process.exit(1); }
const payload = JSON.stringify(manifest);
const sig = sign(null, Buffer.from(payload, "utf8"), createPrivateKey(readFileSync(keyPath))).toString("base64");
writeFileSync(join(dist, "update.json"), JSON.stringify({ payload, sig }));
const embedded = { ...manifest, files: Object.fromEntries(assets.map((n) => [n, 1])) };
const shellHtml = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=1920, initial-scale=1" />
    <title>SkMate IPTV</title>
  </head>
  <body>
    <div id="app"></div>
    <script>window.__SKMATE_EMBEDDED__=${JSON.stringify(embedded)};</script>
    <script src="nacl.min.js"></script>
    <script src="shell.js"></script>
  </body>
</html>
`;
const shellJs = readFileSync(join(platform, "shell/shell.js"));
// TweetNaCl 1.0.3 (public domain): the shell's Ed25519 check of update.json.
const naclJs = readFileSync(join(web, "node_modules/tweetnacl/nacl-fast.min.js"));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const app_ = files(dist);
// The bundled fonts (Plus Jakarta Sans, Roboto Cyrillic) are SIL OFL 1.1: their licence travels with every package.
const fonts = join(web, "packages/ui/src/fonts");
for (const name of readdirSync(fonts).filter((n) => n.startsWith("OFL-"))) app_[`licenses/${name}`] = readFileSync(join(fonts, name));
const zip = (entries) => zipSync(entries, { level: 9, mtime: new Date("2026-01-01T00:00:00Z") });

writeFileSync(join(out, `SkMate-IPTV-web-v${version}.zip`), zip(app_));

const config = readFileSync(join(platform, "tizen/config.xml"), "utf8").replace(/(<widget[^>]*\sversion=")[^"]*/, `$1${version}`);
writeFileSync(join(out, `SkMate-IPTV-tizen-v${version}.wgt`), zip({
  ...app_,
  "index.html": new TextEncoder().encode(shellHtml),
  "shell.js": shellJs,
  "nacl.min.js": naclJs,
  "config.xml": new TextEncoder().encode(config),
  "icon.png": readFileSync(join(platform, "icon-tizen.png")),
}));

const webos = join(out, "webos");
cpSync(dist, webos, { recursive: true, filter: (p) => !p.endsWith(".map") });
writeFileSync(join(webos, "index.html"), shellHtml);
writeFileSync(join(webos, "shell.js"), shellJs);
writeFileSync(join(webos, "nacl.min.js"), naclJs);
mkdirSync(join(webos, "licenses"), { recursive: true });
for (const name of readdirSync(fonts).filter((n) => n.startsWith("OFL-"))) cpSync(join(fonts, name), join(webos, "licenses", name));
const info = JSON.parse(readFileSync(join(platform, "webos/appinfo.json"), "utf8"));
writeFileSync(join(webos, "appinfo.json"), JSON.stringify({ ...info, version }, null, 2) + "\n");
cpSync(join(platform, "icon.png"), join(webos, "icon.png"));
cpSync(join(platform, "icon-large.png"), join(webos, "icon-large.png"));
cpSync(join(platform, "splash.png"), join(webos, "splash.png"));

console.log(`packed v${version} into ${relative(process.cwd(), out) || out}`);
