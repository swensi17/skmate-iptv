import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { alreadyTried, fetchRelease, install, isUpdate, mayInstallNow, releaseUrl, updateEveryMs, type Release } from "./updates";

/** Android OwnTVShell: the look at start waits 5 s. */
const FIRST = 5000;
/** With installs only at night, how often to see whether the night has come. */
const WINDOW_TICK = 10 * 60_000;

/** Settings › Общие настройки › the four update rows (Android UpdatePrefs + updateCheckOnStart). */
export interface UpdatePolicy {
  /** Install by itself (when the window allows); off = ask. */
  auto: boolean;
  /** Look once, 5 s after the app opens. */
  onStart: boolean;
  /** Look again while the app is open: never ("start"), every 6 hours, once a day. */
  every: "start" | "6h" | "day";
  /** An automatic install: any time, or only 02:00–06:00 (otherwise it asks, as on Android). */
  window: "any" | "night";
}

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "unreachable" }
  | { kind: "found"; release: Release }
  | { kind: "installing"; release: Release }
  | { kind: "failed"; release: Release };

/**
 * Looks for a newer build 5 s after the start (when [UpdatePolicy.onStart]) and then as often as [UpdatePolicy.every]
 * says. With [UpdatePolicy.auto] on it installs by itself when the install window allows, but never in the middle of a
 * picture ([busy]); otherwise it asks: [asking] is the update to put in the dialog ([later] puts it off until the next
 * look finds it again).
 */
export function useUpdates(policy: UpdatePolicy, busy: boolean) {
  const { auto, onStart, every, window: win } = policy;
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

  // Once per start, and only when the viewer wants it (Android: startupUpdateCheckDone).
  const started = useRef(false);
  useEffect(() => {
    if (!onStart || started.current) return;
    started.current = true;
    const first = setTimeout(() => void check(true), FIRST);
    return () => clearTimeout(first);
  }, [onStart, check]);
  // Again every few hours while the app is open; a look that finds the update shows it again after "Later".
  useEffect(() => {
    const ms = updateEveryMs(every);
    if (ms <= 0) return;
    const id = setInterval(() => { setDismissed(false); void check(true); }, ms);
    return () => clearInterval(id);
  }, [every, check]);

  // Installs only at night: look at the clock now and then, so a found update goes in once the night comes.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!auto || win !== "night" || state.kind !== "found") return;
    const id = setInterval(() => setTick((n) => n + 1), WINDOW_TICK);
    return () => clearInterval(id);
  }, [auto, win, state.kind]);
  const allowed = mayInstallNow(win);

  // Automatic: as soon as nothing is playing and the window allows.
  useEffect(() => {
    if (auto && allowed && !busy && state.kind === "found") run(state.release);
  }, [auto, allowed, busy, state, run]);

  // Asked when automatic is off, or it is on but this is not the hour to install (Android shows Install / Later then).
  const asking = (!auto || !allowed) && !busy && !dismissed && state.kind === "found" ? state.release : null;
  const dialog = state.kind === "installing" ? state.release : asking;
  return {
    state, asking, dialog,
    check: () => check(false),
    install: () => { if (state.kind === "found" || state.kind === "failed") run(state.release); },
    later: () => setDismissed(true),
  };
}
