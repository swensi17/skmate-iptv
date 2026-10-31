import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { alreadyTried, fetchRelease, install, isUpdate, releaseUrl, type Release } from "./updates";

const EVERY = 6 * 60 * 60 * 1000;
const FIRST = 4000;

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "unreachable" }
  | { kind: "found"; release: Release }
  | { kind: "installing"; release: Release }
  | { kind: "failed"; release: Release };

/**
 * Looks for a newer build shortly after the start and every six hours. With [auto] on it installs by itself,
 * but never in the middle of a picture ([busy]); with it off it asks: [asking] is the update to put in the dialog,
 * once for every start of the app ([later] only puts it off until the next start).
 */
export function useUpdates(auto: boolean, busy: boolean) {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });
  const [dismissed, setDismissed] = useState(false);
  const running = useRef(false);

  const run = useCallback((release: Release) => {
    setState({ kind: "installing", release });
    void install(release, {
      caches: typeof caches !== "undefined" ? caches : undefined,
      workers: typeof navigator !== "undefined" ? navigator.serviceWorker : undefined,
      session: sessionStorage,
      go: (url) => location.replace(url),
      here: location.href,
    }).catch(() => setState({ kind: "failed", release }));
  }, []);

  const check = useCallback(async (quiet = true) => {
    if (running.current) return;
    running.current = true;
    if (!quiet) setState({ kind: "checking" });
    try {
      const rel = await fetchRelease(releaseUrl(location.href));
      if (rel === null) { if (!quiet) setState({ kind: "unreachable" }); return; }
      if (!isUpdate(rel, { version: __APP_VERSION__, build: __APP_BUILD__ })) { setState(quiet ? { kind: "idle" } : { kind: "current" }); return; }
      // The same build already tried and still here: a cache holds the old page; do not reload in a loop.
      let tried = false;
      try { tried = alreadyTried(rel.build, sessionStorage); } catch { /* storage blocked */ }
      setState(tried ? { kind: "failed", release: rel } : { kind: "found", release: rel });
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void check(true), FIRST);
    const every = setInterval(() => void check(true), EVERY);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [check]);

  // Automatic: as soon as nothing is playing.
  useEffect(() => {
    if (auto && !busy && state.kind === "found") run(state.release);
  }, [auto, busy, state, run]);

  const asking = !auto && !busy && !dismissed && state.kind === "found" ? state.release : null;
  const dialog = state.kind === "installing" ? state.release : asking;
  return {
    state, asking, dialog,
    check: () => check(false),
    install: () => { if (state.kind === "found" || state.kind === "failed") run(state.release); },
    later: () => setDismissed(true),
  };
}
