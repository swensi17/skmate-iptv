const KEY = "skmate.favorites.v1";
/** The same channel across reloads: its tvg-id, or name and link together (one stream can sit under two names). */
export const channelKey = (c) => { var _a; return (_a = c.tvgId) !== null && _a !== void 0 ? _a : `${c.name}|${c.url}`; };
export function toggle(favs, key) {
    const next = new Set(favs);
    if (!next.delete(key))
        next.add(key);
    return next;
}
export function loadFavorites() {
    var _a;
    try {
        const raw = JSON.parse((_a = localStorage.getItem(KEY)) !== null && _a !== void 0 ? _a : "[]");
        return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : []);
    }
    catch (_b) {
        return new Set();
    }
}
export function saveFavorites(favs) {
    try {
        localStorage.setItem(KEY, JSON.stringify(Array.from(favs)));
    }
    catch ( /* not persisted */_a) { /* not persisted */ }
}
