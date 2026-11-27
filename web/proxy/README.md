# Playlist proxy (Cloudflare Workers)

Fallback only: the web app asks the provider directly first and uses this proxy when the browser blocked that (CORS).
Playlist text only (starts with `#EXTM3U`, up to 15 MB), never video. Nothing is logged or stored. Only skmate.uz may call it.

Deploy (free plan, your Cloudflare account; log in yourself, no keys in chat):
1. `npm i -g wrangler`, then `wrangler login`.
2. In this folder: `wrangler deploy worker.js --name skmate-playlist --compatibility-date 2026-01-01`
3. Put the address it prints (https://skmate-playlist.<you>.workers.dev) into `web/apps/tv/.env.production` as
   `VITE_PLAYLIST_PROXY=https://skmate-playlist.<you>.workers.dev`, then build the site again.
4. Optional in the Cloudflare panel: a rate-limit rule on this Worker (for example 60 requests per minute per IP).
