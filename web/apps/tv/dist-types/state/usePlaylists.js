import { useCallback, useEffect, useState } from "preact/hooks";
import { parseM3U } from "@skmate/core";
import { t } from "../i18n";
import { cacheDrop, cacheGet, cachePut, fetchPlaylist, PlaylistError } from "./fetchPlaylist";
import { demoText } from "./playlist";
import { addPlaylist, loadStore, nextActive, normalizeUrl, removePlaylist, saveStore } from "./playlists";
const ERRORS = {
    network: "playlistErrNetwork", http: "playlistErrHttp", invalid: "playlistErrInvalid", timeout: "playlistErrTimeout",
};
const DEMO_URL = "demo://playlist";
/** The playlists, the one in use and its channels: everything the screens need, nothing about how they look. */
export function usePlaylists() {
    var _a;
    const [store, setStore] = useState(loadStore);
    const [channels, setChannels] = useState([]);
    const [status, setStatus] = useState({ kind: "idle" });
    const active = (_a = store.list.find((p) => p.id === store.activeId)) !== null && _a !== void 0 ? _a : null;
    useEffect(() => { saveStore(store); }, [store]);
    // Load the active playlist: the cached copy shows at once, the network copy replaces it.
    useEffect(() => {
        if (!active) {
            setChannels([]);
            setStatus({ kind: "idle" });
            return;
        }
        let live = true;
        const cached = cacheGet(active.id);
        if (cached)
            setChannels(parseM3U(cached));
        if (active.url === DEMO_URL) {
            setChannels(parseM3U(demoText()));
            setStatus({ kind: "idle" });
            return;
        }
        setStatus(cached ? { kind: "idle" } : { kind: "loading" });
        fetchPlaylist(active.url).then((text) => {
            if (!live)
                return;
            cachePut(active.id, text);
            setChannels(parseM3U(text));
            setStatus({ kind: "idle" });
        }, (e) => {
            if (!live || cached)
                return; // a stale list beats an error screen
            setStatus({ kind: "error", message: t(ERRORS[e instanceof PlaylistError ? e.kind : "network"]) });
        });
        return () => { live = false; };
    }, [active === null || active === void 0 ? void 0 : active.id, active === null || active === void 0 ? void 0 : active.url]);
    /** Returns an error text when the link is not usable, null when the playlist was added. */
    const add = useCallback((input) => {
        const url = normalizeUrl(input);
        if (!url)
            return t("playlistBadUrl");
        setStore((s) => {
            var _a, _b;
            const list = addPlaylist(s.list, url);
            const id = (_b = (_a = list.find((p) => p.url === url)) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null;
            return { list, activeId: id };
        });
        return null;
    }, []);
    const addDemo = useCallback(() => {
        setStore((s) => {
            var _a, _b;
            const list = addPlaylist(s.list, DEMO_URL, t("demoPlaylist"));
            return { list, activeId: (_b = (_a = list.find((p) => p.url === DEMO_URL)) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : s.activeId };
        });
    }, []);
    const select = useCallback((id) => setStore((s) => (Object.assign(Object.assign({}, s), { activeId: id }))), []);
    const remove = useCallback((id) => {
        cacheDrop(id);
        setStore((s) => {
            const list = removePlaylist(s.list, id);
            return { list, activeId: nextActive(list, s.activeId === id ? null : s.activeId) };
        });
    }, []);
    return { store, active, channels, status, add, addDemo, select, remove };
}
