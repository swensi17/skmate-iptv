// Rebuilds the Media Station X files of skmate.uz/msx from the public WALS catalogue (wals09.github.io) with SkMate IPTV added
// as the first icon of "Все приложения" and "IPTV приложения". Run before a site release, then copy the files to the site
// (gh-pages /msx/). Usage: node scripts/msx-sync.mjs <output folder, e.g. the gh-pages checkout's msx folder>
// Only the menu and the section lists are copied: the apps' own pages, images and templates stay on the catalogue's site,
// so they keep updating there. Credit: the catalogue is made by WALS (https://wals09.github.io/).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2];
if (!OUT) { console.error("usage: node scripts/msx-sync.mjs <output folder>"); process.exit(1); }
const SRC = "https://wals09.github.io/msx";
const OURS = "http://skmate.uz/msx";
const SECTIONS = { all: "mooviestile/all", iptv: "mooviestile/iptv", free_kino: "mooviestile/free_kino", full_kino: "mooviestile/full_kino", social: "mooviestile/social", store: "mooviestile/store", panel_tems: "tema/panel_tems" };
const TEXT = "IPTV плеер для телевизора: каналы из вашего плейлиста, программа передач, архив, избранное. Работает с m3u, m3u8, Xtream и Stalker.";
const ICON = "http://skmate.uz/icon.png";
const ours = (x) => String(x.action || "").includes("skmate.uz");

const get = async (path) => { const r = await fetch(`${SRC}/${path}.json`); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); };
mkdirSync(OUT, { recursive: true });
const write = (name, json) => writeFileSync(join(OUT, `${name}.json`), JSON.stringify(json, null, 2) + "\n");

const menu = await get("mooviestile/menu_ms");
for (const item of menu.menu) {
  for (const [name, path] of Object.entries(SECTIONS)) if (item.data === `${SRC}/${path}.json`) item.data = `${OURS}/${name}.json`;
}
write("menu", menu);
for (const [name, path] of Object.entries(SECTIONS)) {
  const j = await get(path);
  if (name === "iptv") j.items = [{ titleHeader: "", description: `{col:white}SkMate IPTV{col} {br}${TEXT}`, image: ICON, action: "link:http://skmate.uz/" }, ...j.items.filter((x) => !ours(x))];
  if (name === "all") j.items = [{ selection: { important: true, action: "update:content:underlay:text", data: { headline: "SkMate IPTV", text: TEXT } }, image: ICON, action: "link:http://skmate.uz/" }, ...j.items.filter((x) => !ours(x))];
  write(name, j);
}
write("dictionary", await get("dictionary"));
console.log(`msx files written to ${OUT}`);
