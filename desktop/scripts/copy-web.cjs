// Puts the built web app (web/apps/tv/dist) next to main.cjs as app/, the folder the window loads.
const { cpSync, existsSync, rmSync } = require("node:fs");
const { join } = require("node:path");

const from = join(__dirname, "../../web/apps/tv/dist");
const to = join(__dirname, "../app");
if (!existsSync(join(from, "index.html"))) {
  console.error("web/apps/tv/dist is missing: run `npm run build` in web/ first");
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true, filter: (p) => !p.endsWith(".map") });
console.log("web app copied into desktop/app");
