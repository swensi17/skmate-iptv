import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import legacy from "@vitejs/plugin-legacy";
import type { Plugin } from "vite";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

/**
 * Development only: a browser may not read a guide from a server that sends no CORS headers, so in `npm run dev`
 * the page asks this endpoint, which fetches the address and passes the bytes on. A TV app does not need it.
 */
function devProxy(): Plugin {
  return {
    name: "skmate-dev-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__proxy", async (req, res) => {
        const target = new URL(req.url ?? "", "http://x").searchParams.get("url");
        if (!target || !/^https?:\/\//i.test(target)) { res.statusCode = 400; res.end("bad url"); return; }
        try {
          const up = await fetch(target, { redirect: "follow" });
          res.statusCode = up.status;
          res.setHeader("Access-Control-Allow-Origin", "*");
          const type = up.headers.get("content-type");
          if (type) res.setHeader("Content-Type", type);
          if (up.body) {
            // A server that cuts the connection mid-download must end this one request, never the dev server.
            const body = Readable.fromWeb(up.body as never);
            body.on("error", () => res.destroy());
            res.on("close", () => body.destroy());
            body.pipe(res);
          } else {
            res.end();
          }
        } catch (e) {
          res.statusCode = 502;
          res.end(String(e));
        }
      });
    },
  };
}

const BUILD = Date.now();

/** Next to the app, `version.json` says which build is deployed: a running app compares it with its own to find an update. */
function versionFile(): Plugin {
  return {
    name: "skmate-version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: pkg.version, build: BUILD }) });
    },
  };
}

// The oldest target is webOS 4 (Chromium 53) and Tizen 4 (Chromium 56): a legacy bundle goes next to the modern one.
export default defineConfig({
  base: "./",
  // One Preact for the whole bundle. The workspaces hold different copies (10.x beside the app, another one at the
  // root); two copies in one bundle break hooks ("Cannot read properties of undefined (reading '__H')").
  resolve: { dedupe: ["preact"] },
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_BUILD__: String(BUILD) },
  plugins: [devProxy(), versionFile(), preact(), legacy({ targets: ["chrome >= 53", "safari >= 10"] })],
  build: { target: "es2017", sourcemap: false },
  server: { port: 5173, host: true },
});
