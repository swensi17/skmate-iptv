import { parseM3U } from "@skmate/core";
import { scoped } from "./scope";

// A playlist opened from a file has no address to fetch it from again: its text is the only copy, so it is kept in
// IndexedDB (no 5 MB limit as in localStorage), per profile, under its own `local:` address.

export const LOCAL_PREFIX = "local:";

export function isLocal(url: string): boolean {
  return url.startsWith(LOCAL_PREFIX);
}

/** A new address for a file's playlist. */
export function localUrl(now: number = Date.now(), random: number = Math.random()): string {
  return `${LOCAL_PREFIX}${now.toString(36)}${Math.floor(random * 1e6).toString(36)}`;
}

/** The playlist's name from the file's ("Мой ТВ.m3u8" → "Мой ТВ"), and whether the text holds any channel. */
export function readPlaylistFile(fileName: string, text: string): { name: string; ok: boolean } {
  const name = fileName.replace(/\.(m3u8?|txt)$/i, "").trim() || fileName;
  return { name, ok: parseM3U(text).length > 0 };
}

const DB = "skmate";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const req = work(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => { resolve(req.result); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  }));
}

const keyOf = (url: string) => scoped(`skmate.file.${url}`);

export function fileGet(url: string): Promise<string | null> {
  return run<unknown>("readonly", (s) => s.get(keyOf(url))).then((v) => (typeof v === "string" ? v : null), () => null);
}

export function filePut(url: string, text: string): Promise<void> {
  return run("readwrite", (s) => s.put(text, keyOf(url))).then(() => undefined);
}

export function fileDrop(url: string): Promise<void> {
  return run("readwrite", (s) => s.delete(keyOf(url))).then(() => undefined, () => undefined);
}
