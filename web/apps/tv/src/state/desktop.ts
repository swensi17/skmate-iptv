import { useEffect, useState } from "preact/hooks";

/** What the Windows app (desktop/preload.cjs) lends the page; absent on a TV and in a browser. */
interface DesktopBridge {
  toggleFullScreen(): void;
  isFullScreen(): Promise<boolean>;
  onFullScreen(listener: (on: boolean) => void): () => void;
}

const bridge = (): DesktopBridge | null => (window as unknown as { skmateDesktop?: DesktopBridge }).skmateDesktop ?? null;

/** Full screen in the Windows app: whether it is on and the switch; null where there is no window to switch. */
export function useFullScreen(): { on: boolean; toggle: () => void } | null {
  const app = bridge();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!app) return;
    app.isFullScreen().then(setOn, () => undefined);
    return app.onFullScreen(setOn);
  }, []);
  return app ? { on, toggle: () => app.toggleFullScreen() } : null;
}
