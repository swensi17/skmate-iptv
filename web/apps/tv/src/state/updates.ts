/** What `version.json` next to the deployed app says. */
export interface Release { version: string; build: number; notes?: string }

export interface Running { version: string; build: number }

/** The release in a file's text, or null when the text is not one (a host that answers every address with a page). */
export function parseRelease(text: string): Release | null {
  try {
    const o = JSON.parse(text) as Partial<Release>;
    if (typeof o.version !== "string" || !/^\d+(\.\d+){0,3}/.test(o.version) || typeof o.build !== "number" || !isFinite(o.build)) return null;
    return { version: o.version, build: o.build, notes: typeof o.notes === "string" ? o.notes.slice(0, 600) : undefined };
  } catch {
    return null;
  }
}

const parts = (v: string) => v.split(/[.+-]/).slice(0, 4).map((n) => parseInt(n, 10) || 0);

/** -1, 0 or 1: how version [a] stands to [b], number by number ("2.10" is later than "2.9"). */
export function compareVersions(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 4; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** A higher version is an update; the same version rebuilt later is one too, an older or equal build never is. */
export function isUpdate(remote: Release, running: Running): boolean {
  const c = compareVersions(remote.version, running.version);
  return c > 0 || (c === 0 && remote.build > running.build);
}

/** Looks for a newer release. Null on any failure: no update check may ever break the app. */
export async function fetchRelease(url: string, open: typeof fetch = fetch, timeoutMs = 8000): Promise<Release | null> {
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : undefined;
  try {
    const res = await open(url, { cache: "no-store", signal: ctl?.signal });
    return res.ok ? parseRelease(await res.text()) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const TRIED = "skmate.update.tried";

/** The address of this app's own version file, with a changing query so no cache answers for it. */
export function releaseUrl(base: string, now = Date.now()): string {
  return new URL(`version.json?t=${now}`, base).toString();
}

/** What a failed install may not repeat: the build it already tried to load, kept for the session. */
export function alreadyTried(build: number, store: Pick<Storage, "getItem">): boolean {
  try { return store.getItem(TRIED) === String(build); } catch { return false; }
}

/**
 * Installs the release: drops the browser's cached copies of the app, remembers the build so a stubborn cache
 * cannot loop the reload, and loads the page again under a new address. The viewer's data is untouched: it lives in
 * localStorage under its own keys, and an old setting file simply gains the defaults of the new fields.
 */
export async function install(
  release: Release,
  env: { caches?: CacheStorage; workers?: ServiceWorkerContainer; session: Pick<Storage, "setItem">; go: (url: string) => void; here: string },
): Promise<void> {
  try { env.session.setItem(TRIED, String(release.build)); } catch { /* the loop guard is best effort */ }
  try {
    if (env.caches) for (const k of await env.caches.keys()) await env.caches.delete(k);
  } catch { /* nothing cached */ }
  try {
    if (env.workers) for (const r of await env.workers.getRegistrations()) await r.unregister();
  } catch { /* no workers */ }
  const u = new URL(env.here);
  u.searchParams.set("v", String(release.build));
  env.go(u.toString());
}
