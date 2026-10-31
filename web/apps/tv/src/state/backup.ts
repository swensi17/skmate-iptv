/**
 * A backup of everything the viewer set up: profiles, playlists, favourites, history, settings. The playlist and
 * guide caches are left out (they are downloaded again), so the file stays small enough to move around.
 */
export interface Backup { app: "skmate-web"; version: 1; at: number; items: Record<string, string> }

const PREFIX = "skmate.";
const CACHES = ["skmate.cache.", "skmate.epg."];

const wanted = (key: string) => key.startsWith(PREFIX) && !CACHES.some((c) => key.startsWith(c)) && !key.startsWith("skmate.hlsdebug");

export function buildBackup(store: Pick<Storage, "length" | "key" | "getItem">, at = Date.now()): Backup {
  const items: Record<string, string> = {};
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    const v = k ? store.getItem(k) : null;
    if (k && v !== null && wanted(k)) items[k] = v;
  }
  return { app: "skmate-web", version: 1, at, items };
}

/** The backup in a file's text, or null when the text is not one of ours. */
export function parseBackup(text: string): Backup | null {
  try {
    const o = JSON.parse(text) as Partial<Backup>;
    if (o.app !== "skmate-web" || o.version !== 1 || !o.items || typeof o.items !== "object") return null;
    const items: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.items)) if (typeof v === "string" && wanted(k)) items[k] = v;
    return { app: "skmate-web", version: 1, at: typeof o.at === "number" ? o.at : 0, items };
  } catch {
    return null;
  }
}

export function restoreBackup(b: Backup, store: Pick<Storage, "setItem">): number {
  let n = 0;
  for (const [k, v] of Object.entries(b.items)) { store.setItem(k, v); n++; }
  return n;
}

/** Removes the downloaded playlists and guides (the viewer's own choices stay). */
export function clearCaches(store: Pick<Storage, "length" | "key" | "removeItem">): number {
  const doomed: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && CACHES.some((c) => k.startsWith(c))) doomed.push(k);
  }
  doomed.forEach((k) => store.removeItem(k));
  return doomed.length;
}
