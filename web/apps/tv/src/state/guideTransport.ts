/** Hosts that refused a direct request (no CORS): from then on they go straight through the proxy. */
const needsProxy = new Set<string>();

const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };

/**
 * Opens a guide or playlist address. A TV app usually reads any server directly; a browser only those that allow
 * it (many IPTV servers send no CORS headers). When a direct request fails and a proxy is known (the one in
 * settings, or the dev server's own), the address is asked through it, and the host is remembered so the next
 * request to that host does not try twice. [init] (an abort signal) goes along either way.
 */
export function guideOpener(proxy: string): (url: string, init?: RequestInit) => Promise<Response> {
  const via = proxy || (import.meta.env.DEV ? "/__proxy?url=" : "");
  // The dev server's own proxy is always there, so it is used first (a direct try would only log a CORS error).
  const first = !proxy && import.meta.env.DEV;
  return async (url, init) => {
    if (!/^https?:\/\//i.test(url)) return fetch(url, init); // a proxy only fetches web addresses
    const host = hostOf(url);
    if (via && (first || needsProxy.has(host))) return fetch(via + encodeURIComponent(url), init);
    try {
      return await fetch(url, init);
    } catch (e) {
      if (!via || init?.signal?.aborted) throw e;
      needsProxy.add(host);
      return fetch(via + encodeURIComponent(url), init);
    }
  };
}

/** Playlists go the same way as guides: straight to the server, or through the proxy when the browser refuses. */
export const playlistOpener = (proxy = "") => guideOpener(proxy) as typeof fetch;
