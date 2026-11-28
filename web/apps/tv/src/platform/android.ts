/**
 * The Android shell (Capacitor, apps/android). Everything goes through the global `Capacitor.Plugins` the shell injects,
 * so the TV builds neither import nor load anything from it: outside the shell `window.Capacitor` does not exist.
 */
interface AppPlugin {
  addListener(event: "backButton", cb: (e: { canGoBack: boolean }) => void): unknown;
  exitApp(): unknown;
}

/** The Capacitor App plugin, or null when this is not the Android shell (or the plugin is not in the APK). */
export function capacitorApp(w: Window = window): AppPlugin | null {
  const cap = (w as unknown as { Capacitor?: { Plugins?: { App?: AppPlugin } } }).Capacitor;
  return cap?.Plugins?.App ?? null;
}

/** The hardware Back as the key the app already knows (isBack: Escape), sent to whatever has the focus. */
export function backKey(doc: Document = document): boolean {
  const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  (doc.activeElement ?? doc.body).dispatchEvent(e);
  return e.defaultPrevented;
}

/**
 * Android's Back button becomes the app's own Back: a dialog closes, a player returns to the list, and so on. The app
 * itself leaves (platform/index.ts exitApp, which calls App.exitApp) when its Back handler has nothing left to close.
 * Returns the function that stops listening (none outside the shell).
 */
export function installAndroidBack(w: Window = window): () => void {
  const app = capacitorApp(w);
  if (!app) return () => {};
  const handle = app.addListener("backButton", () => { backKey(w.document); }) as { remove?: () => void } | Promise<{ remove?: () => void }>;
  return () => { void Promise.resolve(handle).then((h) => h?.remove?.()); };
}
