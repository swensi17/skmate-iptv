// Packs the built web app (apps/tv/dist) for the televisions, into web/release/:
//   SkMate-IPTV-web-vX.Y.Z.zip      the app for any web server (GitHub Pages, a NAS, a hosted TV app)
//   SkMate-IPTV-tizen-vX.Y.Z.wgt    Samsung Tizen widget, unsigned: sign it with your own Samsung
//                                   certificate (Tizen Studio) before it installs on a TV
//   webos/                          the webOS app folder; `ares-package web/release/webos` turns it into an .ipk
// The version comes from apps/tv/package.json and is written into config.xml and appinfo.json here,
// so the three never disagree. Source maps, tests and dev files never get in: only dist and the icons.
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, cpSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

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

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const app_ = files(dist);
const zip = (entries) => zipSync(entries, { level: 9, mtime: new Date("2026-01-01T00:00:00Z") });

writeFileSync(join(out, `SkMate-IPTV-web-v${version}.zip`), zip(app_));

const config = readFileSync(join(platform, "tizen/config.xml"), "utf8").replace(/(<widget[^>]*\sversion=")[^"]*/, `$1${version}`);
writeFileSync(join(out, `SkMate-IPTV-tizen-v${version}.wgt`), zip({
  ...app_,
  "config.xml": new TextEncoder().encode(config),
  "icon.png": readFileSync(join(platform, "icon-tizen.png")),
}));

const webos = join(out, "webos");
cpSync(dist, webos, { recursive: true, filter: (p) => !p.endsWith(".map") });
const info = JSON.parse(readFileSync(join(platform, "webos/appinfo.json"), "utf8"));
writeFileSync(join(webos, "appinfo.json"), JSON.stringify({ ...info, version }, null, 2) + "\n");
cpSync(join(platform, "icon.png"), join(webos, "icon.png"));
cpSync(join(platform, "icon-large.png"), join(webos, "icon-large.png"));

console.log(`packed v${version} into ${relative(process.cwd(), out) || out}`);
