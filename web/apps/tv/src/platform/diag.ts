/**
 * A black box for the TV: when the whole TV hangs (the page cannot say why afterwards), the last thing it knew is kept.
 * Every few seconds a small record (memory, page size, videos, the last errors) goes to localStorage; the record of the
 * run before is kept beside it (`skmate.diag.prev`), so after a restart it can be read: the last heartbeat shows how
 * much memory the page had and what it was doing when it stopped. Nothing leaves the TV.
 */
const KEY = "skmate.diag";
const PREV = "skmate.diag.prev";
const EVERY_MS = 3000;

interface Record_ { at: number; up: number; heapMB: number | null; nodes: number; videos: number; hash: string; errors: string[] }

export function installDiag(): void {
  try {
    const old = localStorage.getItem(KEY);
    if (old) localStorage.setItem(PREV, old);
  } catch { return; }
  const errors: string[] = [];
  const note = (m: string) => { errors.push(`${new Date().toISOString().slice(11, 19)} ${m.slice(0, 160)}`); if (errors.length > 6) errors.shift(); };
  window.addEventListener("error", (e) => note(`error ${e.message}`));
  window.addEventListener("unhandledrejection", (e) => note(`reject ${String((e as PromiseRejectionEvent).reason)}`));
  const start = Date.now();
  const beat = () => {
    if (document.hidden) return;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const r: Record_ = {
      at: Date.now(), up: Math.round((Date.now() - start) / 1000), heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
      nodes: document.getElementsByTagName("*").length, videos: document.getElementsByTagName("video").length, hash: location.hash, errors,
    };
    try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* full or blocked: the box just stops writing */ }
  };
  beat();
  setInterval(beat, EVERY_MS);
}
