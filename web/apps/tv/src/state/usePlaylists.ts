import { useCallback, useEffect, useState } from "preact/hooks";
import { guidesInHeader, parseM3U, type Channel } from "@skmate/core";
import { t, type Key } from "../i18n";
import { cacheDrop, cacheGet, cachePut, fetchPlaylist, PlaylistError } from "./fetchPlaylist";
import { fileDrop, fileGet, filePut, isLocal, localUrl, readPlaylistFile } from "./localFiles";
import { demoText } from "./playlist";
import { desktop } from "./desktop";
import { addPlaylist, updatePlaylist, isStalker, xtreamGuide, loadStore, nextActive, normalizeUrl, playlistFromSearch, removePlaylist, saveStore, type PlaylistStore } from "./playlists";

export type Status = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string };

const ERRORS: Record<PlaylistError["kind"], Key> = {
  network: "playlistErrNetwork", http: "playlistErrHttp", invalid: "playlistErrInvalid", timeout: "playlistErrTimeout",
};

const DEMO_URL = "demo://playlist";

/** The playlists, the one in use and its channels: everything the screens need, nothing about how they look. */
export function usePlaylists() {
  const [store, setStore] = useState<PlaylistStore>(() => {
    const stored = loadStore();
    const fromAddress = typeof location === "undefined" ? null : playlistFromSearch(location.search);
    if (!fromAddress) return stored;
    // The link leaves the address bar at once: it often carries a personal key.
    try { history.replaceState(null, "", location.pathname); } catch { /* the address just stays as it is */ }
    const list = addPlaylist(stored.list, fromAddress);
    return { list, activeId: list.find((p) => p.url === fromAddress)?.id ?? stored.activeId };
  });
  const [channels, setChannels] = useState<Channel[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [headerGuides, setHeaderGuides] = useState<string[]>([]);

  const active = store.list.find((p) => p.id === store.activeId) ?? null;

  useEffect(() => { saveStore(store); }, [store]);

  // Load the active playlist: the cached copy shows at once, the network copy replaces it.
  useEffect(() => {
    if (!active) { setChannels([]); setStatus({ kind: "idle" }); return; }
    let live = true;
    const cached = cacheGet(active.id);
    if (cached) {
      setChannels(parseM3U(cached));
      const own = xtreamGuide(active.url);
      const named = guidesInHeader(cached);
      setHeaderGuides(own && !named.includes(own) ? [...named, own] : named);
    }
    if (active.url === DEMO_URL) { setChannels(parseM3U(demoText())); setStatus({ kind: "idle" }); return; }
    // A playlist from a file is read from this device: there is nothing to fetch.
    if (isLocal(active.url)) {
      fileGet(active.url).then((text) => {
        if (!live) return;
        if (text === null) { setStatus({ kind: "error", message: t("srcFileBad") }); return; }
        setChannels(parseM3U(text));
        setHeaderGuides(guidesInHeader(text));
        setStatus({ kind: "idle" });
      });
      return () => { live = false; };
    }
    setStatus(cached ? { kind: "idle" } : { kind: "loading" });
    // A Stalker portal is read by the Windows app, which hands back an ordinary M3U on this computer.
    const stalker = isStalker(active.url);
    const address = stalker ? (desktop()?.stalkerPlaylist(active.url) ?? Promise.resolve(null)) : Promise.resolve(active.url);
    address.then((u) => (u ? fetchPlaylist(u) : Promise.reject(new PlaylistError("network")))).then(
      (text) => {
        if (!live) return;
        cachePut(active.id, text);
        setChannels(parseM3U(text));
        // An Xtream login brings its own guide for the same account, even when the list does not name it.
        const own = xtreamGuide(active.url);
        const named = guidesInHeader(text);
        setHeaderGuides(own && !named.includes(own) ? [...named, own] : named);
        setStatus({ kind: "idle" });
      },
      (e: unknown) => {
        if (!live || cached) return; // a stale list beats an error screen
        // A portal says 401 when it refuses the MAC (desktop/stalker.cjs), anything else when it cannot be reached.
        if (stalker) { setStatus({ kind: "error", message: t(e instanceof PlaylistError && e.message === "http: 401" ? "stkMacRefused" : "stkPortalFailed") }); return; }
        setStatus({ kind: "error", message: t(ERRORS[e instanceof PlaylistError ? e.kind : "network"]) });
      },
    );
    return () => { live = false; };
  }, [active?.id, active?.url]);

  /** Returns an error text when the link is not usable, null when the playlist was added. */
  const add = useCallback((input: string): string | null => {
    const url = isStalker(input) ? input : normalizeUrl(input);
    if (!url) return t("playlistBadUrl");
    setStore((s) => {
      const list = addPlaylist(s.list, url);
      const id = list.find((p) => p.url === url)?.id ?? null;
      return { list, activeId: id };
    });
    return null;
  }, []);

  /** A playlist from a file of this device (Windows, a browser): an error text, or null when it was added. */
  const addFile = useCallback(async (fileName: string, text: string): Promise<string | null> => {
    const { name, ok } = readPlaylistFile(fileName, text);
    if (!ok) return t("srcFileBad");
    const url = localUrl();
    try { await filePut(url, text); } catch { return t("srcFileBad"); }
    setStore((s) => {
      const list = addPlaylist(s.list, url, name);
      return { list, activeId: list.find((p) => p.url === url)?.id ?? s.activeId };
    });
    return null;
  }, []);

  /** A playlist's name and link changed: an error text, or null when saved. A playlist from a file keeps its link. */
  const update = useCallback((id: string, name: string, input: string): string | null => {
    const old = store.list.find((p) => p.id === id);
    if (!old) return null;
    const url = isLocal(old.url) || old.url === DEMO_URL ? old.url : isStalker(input) ? input : normalizeUrl(input);
    if (!url) return t("playlistBadUrl");
    const list = updatePlaylist(store.list, id, name, url);
    if (!list) return t("playlistBadUrl");
    if (url !== old.url) cacheDrop(id); // another link is another list: the copy kept for the old one is not shown
    setStore((s) => ({ ...s, list: updatePlaylist(s.list, id, name, url) ?? s.list }));
    return null;
  }, [store.list]);

  const addDemo = useCallback(() => {
    setStore((s) => {
      const list = addPlaylist(s.list, DEMO_URL, t("demoPlaylist"));
      return { list, activeId: list.find((p) => p.url === DEMO_URL)?.id ?? s.activeId };
    });
  }, []);

  const select = useCallback((id: string) => setStore((s) => ({ ...s, activeId: id })), []);

  const remove = useCallback((id: string) => {
    cacheDrop(id);
    setStore((s) => {
      const gone = s.list.find((p) => p.id === id);
      if (gone && isLocal(gone.url)) void fileDrop(gone.url); // the only copy goes with the playlist
      const list = removePlaylist(s.list, id);
      return { list, activeId: nextActive(list, s.activeId === id ? null : s.activeId) };
    });
  }, []);

  return { store, active, channels, status, headerGuides, add, addFile, addDemo, select, update, remove };
}
