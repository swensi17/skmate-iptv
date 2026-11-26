/*
 * Where the guide is kept between starts: IndexedDB on a TV (hundreds of megabytes are allowed there, against the
 * 5 MB of localStorage), and a plain Map where IndexedDB is missing or refuses (tests, a private window, an engine
 * that never answers). One small interface, so the guide code above it is the same either way.
 */

/** Keys from [lo] (included) to [hi] (excluded). */
export type KeyRange = [string, string];

/** The keys that start with [prefix]. */
export const prefixRange = (prefix: string): KeyRange => [prefix, prefix + "\uffff"];

export interface GuideKv {
  /** True when what is written survives a restart (IndexedDB), false for the in-memory stand-in. */
  readonly persistent: boolean;
  get<T>(key: string): Promise<T | undefined>;
  /**
   * Hands [each] the values under [prefix] one at a time, in key order. With IndexedDB every value is its own task,
   * so reading a big part of the guide never holds the screen for long.
   */
  scan(prefix: string, each: (key: string, value: unknown) => void): Promise<void>;
  /** Removes every key in [drops], then writes [puts], in one transaction: a reader sees all of it or none. */
  write(puts: ReadonlyArray<[string, unknown]>, drops?: readonly KeyRange[]): Promise<void>;
}

/** The stand-in: a Map, values kept as they are given (the writer never changes a value it has handed over). */
export class MemoryKv implements GuideKv {
  readonly persistent = false;
  private readonly map = new Map<string, unknown>();

  get<T>(key: string): Promise<T | undefined> { return Promise.resolve(this.map.get(key) as T | undefined); }

  async scan(prefix: string, each: (key: string, value: unknown) => void): Promise<void> {
    const [lo, hi] = prefixRange(prefix);
    const keys: string[] = [];
    this.map.forEach((_, k) => { if (k >= lo && k < hi) keys.push(k); });
    keys.sort();
    for (const k of keys) each(k, this.map.get(k));
  }

  write(puts: ReadonlyArray<[string, unknown]>, drops: readonly KeyRange[] = []): Promise<void> {
    if (drops.length > 0) {
      const gone: string[] = [];
      this.map.forEach((_, k) => { if (drops.some(([lo, hi]) => k >= lo && k < hi)) gone.push(k); });
      for (const k of gone) this.map.delete(k);
    }
    for (const [k, v] of puts) this.map.set(k, v);
    return Promise.resolve();
  }

  /** How many keys are kept (tests). */
  get size(): number { return this.map.size; }
  keys(): string[] { return Array.from(this.map.keys()).sort(); }
}

const STORE = "kv";

class IdbKv implements GuideKv {
  readonly persistent = true;
  constructor(private readonly db: IDBDatabase) {}

  get<T>(key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      try {
        const req = this.db.transaction(STORE, "readonly").objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  }

  scan(prefix: string, each: (key: string, value: unknown) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const [lo, hi] = prefixRange(prefix);
        const req = this.db.transaction(STORE, "readonly").objectStore(STORE).openCursor(IDBKeyRange.bound(lo, hi, false, true));
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) { resolve(); return; }
          try { each(String(cursor.key), cursor.value); } catch (e) { reject(e); return; }
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  }

  write(puts: ReadonlyArray<[string, unknown]>, drops: readonly KeyRange[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        for (const [lo, hi] of drops) if (lo < hi) store.delete(IDBKeyRange.bound(lo, hi, false, true));
        for (const [k, v] of puts) store.put(v, k);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error("aborted"));
        tx.onerror = (e) => { e.preventDefault(); }; // the abort that follows reports it
      } catch (e) { reject(e); }
    });
  }
}

/** True for the error a full disk (or the browser's share of it) gives. */
export function isQuotaError(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name ?? "";
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

/**
 * Opens the guide's IndexedDB, or null when there is none or it does not answer within [timeoutMs] (some engines
 * never fire an event when storage is blocked): the caller then keeps the guide in memory for the session.
 */
export function openGuideKv(name = "skmate-guide", timeoutMs = 4000): Promise<GuideKv | null> {
  return new Promise((resolve) => {
    let factory: IDBFactory | undefined;
    try { factory = typeof indexedDB === "undefined" ? undefined : indexedDB; } catch { factory = undefined; }
    if (!factory) { resolve(null); return; }
    let settled = false;
    const finish = (kv: GuideKv | null) => { if (!settled) { settled = true; clearTimeout(timer); resolve(kv); } };
    const timer = setTimeout(() => finish(null), timeoutMs);
    let req: IDBOpenDBRequest;
    try { req = factory.open(name, 1); } catch { finish(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      if (settled) { db.close(); return; }
      // Another tab upgrading the database: this one steps aside rather than block it.
      db.onversionchange = () => db.close();
      finish(new IdbKv(db));
    };
    req.onerror = () => finish(null);
  });
}
