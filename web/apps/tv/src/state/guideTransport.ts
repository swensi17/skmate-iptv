/** Hosts that refused a direct request (no CORS): from then on they go straight through the proxy. */
const needsProxy = new Set<string>();

const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };

/**
 * Opens a guide address. A TV app usually reads any server directly; a browser only those that allow it. When a
 * direct request fails and a proxy is known (the one in settings, or the dev server's own), the address is
 * asked through it, and the host is remembered so the next guide of that host does not try twice.
 */
export function guideOpener(proxy: string): (url: string) => Promise<Response> {
  const via = proxy || (import.meta.env.DEV ? "/__proxy?url=" : "");
  // The dev server's own proxy is always there, so it is used first (a direct try would only log a CORS error).
  const first = !proxy && import.meta.env.DEV;
  return async (url) => {
    const host = hostOf(url);
    if (via && (first || needsProxy.has(host))) return fetch(via + encodeURIComponent(url));
    try {
      return await fetch(url);
    } catch (e) {
      if (!via) throw e;
      needsProxy.add(host);
      return fetch(via + encodeURIComponent(url));
    }
  };
}
