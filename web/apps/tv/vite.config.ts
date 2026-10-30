import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import legacy from "@vitejs/plugin-legacy";

// The oldest target is webOS 4 (Chromium 53) and Tizen 4 (Chromium 56): a legacy bundle goes next to the modern one.
export default defineConfig({
  base: "./",
  plugins: [preact(), legacy({ targets: ["chrome >= 53", "safari >= 10"] })],
  build: { target: "es2017", sourcemap: false },
  server: { port: 5173, host: true },
});
