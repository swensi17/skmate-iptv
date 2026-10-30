const KEY = "skmate.playlists.v1";
/** A readable name from a link: the host, or the last path segment when it says more. */
export function nameFromUrl(url) {
    var _a;
    try {
        const u = new URL(url);
        const last = (_a = u.pathname.split("/").filter(Boolean).pop()) !== null && _a !== void 0 ? _a : "";
        const base = last.replace(/\.[a-z0-9]{2,4}$/i, "");
        return base.length > 2 && !/^(playlist|get|index)$/i.test(base) ? `${u.hostname} / ${base}` : u.hostname;
    }
    catch (_b) {
        return url;
    }
}
/** Accepts only http(s) links; everything else is not a playlist the TV can fetch. */
export function normalizeUrl(input) {
    const s = input.trim();
    if (s === "")
        return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `http://${s}`;
    try {
        const u = new URL(withScheme);
        return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
    }
    catch (_a) {
        return null;
    }
}
/** Adds a playlist; the same link twice is one playlist. */
export function addPlaylist(list, url, name) {
    if (list.some((p) => p.url === url))
        return [...list];
    const id = String(Math.max(0, ...list.map((p) => Number(p.id) || 0)) + 1);
    return [...list, { id, name: (name === null || name === void 0 ? void 0 : name.trim()) || nameFromUrl(url), url }];
}
export function removePlaylist(list, id) {
    return list.filter((p) => p.id !== id);
}
/** After a removal the active playlist stays, or falls to the first one that is left. */
export function nextActive(list, activeId) {
    var _a, _b;
    return list.some((p) => p.id === activeId) ? activeId : (_b = (_a = list[0]) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null;
}
export function loadStore() {
    var _a, _b;
    try {
        const raw = JSON.parse((_a = localStorage.getItem(KEY)) !== null && _a !== void 0 ? _a : "null");
        const list = Array.isArray(raw === null || raw === void 0 ? void 0 : raw.list) ? raw.list.filter((p) => p && typeof p.url === "string") : [];
        return { list, activeId: nextActive(list, (_b = raw === null || raw === void 0 ? void 0 : raw.activeId) !== null && _b !== void 0 ? _b : null) };
    }
    catch (_c) {
        return { list: [], activeId: null };
    }
}
export function saveStore(s) {
    try {
        localStorage.setItem(KEY, JSON.stringify(s));
    }
    catch ( /* the list just does not persist */_a) { /* the list just does not persist */ }
}
