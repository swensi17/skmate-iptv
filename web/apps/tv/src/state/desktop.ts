import { useEffect, useState } from "preact/hooks";

/** What the recorder of the Windows app says about one recording (desktop/recorder.cjs). */
export interface RecordingUpdate {
  id: string;
  state: "recording" | "done" | "failed";
  bytes: number;
  path: string | null;
  error?: string;
}

/** What the Windows app (desktop/preload.cjs) lends the page; absent on a TV and in a browser. */
interface DesktopBridge {
  toggleFullScreen(): void;
  isFullScreen(): Promise<boolean>;
  onFullScreen(listener: (on: boolean) => void): () => void;
  players(): Promise<string[]>;
  openInPlayer(player: string, url: string, title: string, headers: Record<string, string>): Promise<boolean>;
  startRecording(id: string, url: string, title: string, headers: Record<string, string>, stopAtMs: number | null): Promise<boolean>;
  stopRecording(id: string): Promise<boolean>;
  onRecording(listener: (u: RecordingUpdate) => void): () => void;
  openRecordings(): Promise<boolean>;
  revealRecording(path: string): Promise<boolean>;
  /** The address of a Stalker portal's M3U on this computer (desktop/stalker.cjs); null for a source it cannot read. */
  stalkerPlaylist(source: string): Promise<string | null>;
  /** The server another device reaches over Wi-Fi (desktop/companion.cjs): its addresses and PIN. */
  startCompanion(mode: "add" | "sync", strings: Record<string, string>, lang: string, backup?: string): Promise<{ urls: string[]; pin: string }>;
  stopCompanion(): Promise<boolean>;
  onCompanion(listener: (e: CompanionEvent) => void): () => void;
  /** A backup sent to (POST) or taken from (GET) another SkMate on the Wi-Fi. */
  syncRequest(address: string, pin: string, method: "GET" | "POST", body?: string): Promise<SyncResult>;
}

/** A playlist a phone sent (desktop/companion.cjs, the Android app's fields). */
export interface CompanionPayload {
  type: "m3u" | "xtream" | "stalker";
  name: string;
  server: string;
  playlistContent: string;
  playlistFileName: string;
  user: string;
  pass: string;
  portalUrl: string;
  mac: string;
}

export type CompanionEvent = { kind: "payload"; payload: CompanionPayload } | { kind: "backup"; text: string } | { kind: "locked" };
export type SyncResult = { text: string; error?: undefined } | { text?: undefined; error: "unreachable" | "unauthorized" | "bad" };

/** The Windows app's bridge; null on a TV and in a browser. */
export const desktop = (): DesktopBridge | null => (window as unknown as { skmateDesktop?: DesktopBridge }).skmateDesktop ?? null;

/** Full screen in the Windows app: whether it is on and the switch; null where there is no window to switch. */
export function useFullScreen(): { on: boolean; toggle: () => void } | null {
  const app = desktop();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!app) return;
    app.isFullScreen().then(setOn, () => undefined);
    return app.onFullScreen(setOn);
  }, []);
  return app ? { on, toggle: () => app.toggleFullScreen() } : null;
}

/** VLC and mpv found on this computer; empty until asked, and always outside the Windows app. */
export function usePlayers(): string[] {
  const app = desktop();
  const [found, setFound] = useState<string[]>([]);
  useEffect(() => { app?.players().then(setFound, () => undefined); }, []);
  return found;
}

// The recordings running, kept here and not in a screen: one goes on after the player is closed, as on Android.
const running = new Set<string>();
const listeners = new Set<(u: RecordingUpdate | null) => void>();
let subscribed = false;

function follow(app: DesktopBridge): void {
  if (subscribed) return;
  subscribed = true;
  app.onRecording((u) => {
    if (u.state === "recording") running.add(u.id);
    else running.delete(u.id);
    listeners.forEach((l) => l(u));
  });
}

/** Records [id] until [stopAtMs] (the end of the programme on air) or until stopped. */
export function startRecording(id: string, url: string, title: string, headers: Record<string, string>, stopAtMs: number | null): void {
  const app = desktop();
  if (!app) return;
  follow(app);
  running.add(id);
  listeners.forEach((l) => l(null));
  app.startRecording(id, url, title, headers, stopAtMs).catch(() => undefined);
}

export function stopRecording(id: string): void {
  desktop()?.stopRecording(id).catch(() => undefined);
}

/** Whether [id] is being recorded; re-renders as recordings start and end. */
export function useRecording(id: string): boolean {
  const [, tick] = useState(0);
  useEffect(() => {
    const app = desktop();
    if (app) follow(app);
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return running.has(id);
}

/** The last recording that ended (saved or failed), for a note on screen; clear() hides it. */
export function useRecordingEnd(): { end: RecordingUpdate | null; clear: () => void } {
  const [end, setEnd] = useState<RecordingUpdate | null>(null);
  useEffect(() => {
    const app = desktop();
    if (!app) return;
    follow(app);
    const l = (u: RecordingUpdate | null) => { if (u && u.state !== "recording") setEnd(u); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return { end, clear: () => setEnd(null) };
}
