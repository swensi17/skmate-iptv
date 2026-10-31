import { useCallback, useEffect, useState } from "preact/hooks";
import { guidesInHeader, parseM3U, type Channel } from "@skmate/core";
import { t, type Key } from "../i18n";
import { cacheDrop, cacheGet, cachePut, fetchPlaylist, PlaylistError } from "./fetchPlaylist";
import { demoText } from "./playlist";
import { addPlaylist, xtreamGuide, loadStore, nextActive, normalizeUrl, playlistFromSearch, removePlaylist, saveStore, type PlaylistStore } from "./playlists";

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
    setStatus(cached ? { kind: "idle" } : { kind: "loading" });
    fetchPlaylist(active.url).then(
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
        setStatus({ kind: "error", message: t(ERRORS[e instanceof PlaylistError ? e.kind : "network"]) });
      },
    );
    return () => { live = false; };
  }, [active?.id, active?.url]);

  /** Returns an error text when the link is not usable, null when the playlist was added. */
  const add = useCallback((input: string): string | null => {
    const url = normalizeUrl(input);
    if (!url) return t("playlistBadUrl");
    setStore((s) => {
      const list = addPlaylist(s.list, url);
      const id = list.find((p) => p.url === url)?.id ?? null;
      return { list, activeId: id };
    });
    return null;
  }, []);

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
      const list = removePlaylist(s.list, id);
      return { list, activeId: nextActive(list, s.activeId === id ? null : s.activeId) };
    });
  }, []);

  return { store, active, channels, status, headerGuides, add, addDemo, select, remove };
}
