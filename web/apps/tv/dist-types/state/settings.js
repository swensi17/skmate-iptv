import { applyMotion } from "@skmate/ui";
const KEY = "skmate.settings.v1";
export const DEFAULTS = { theme: "system", motion: "auto" };
export function load() {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? Object.assign(Object.assign({}, DEFAULTS), JSON.parse(raw)) : DEFAULTS;
    }
    catch (_a) {
        return DEFAULTS; // storage can be unavailable or hold something else: start from the defaults
    }
}
export function save(s) {
    try {
        localStorage.setItem(KEY, JSON.stringify(s));
    }
    catch ( /* the setting just does not persist */_a) { /* the setting just does not persist */ }
}
/** The theme that is actually drawn: "system" follows the TV. */
export function resolveTheme(theme, systemDark) {
    return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}
export function applyTheme(theme, root = document.documentElement) {
    const dark = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)").matches : true;
    root.setAttribute("data-theme", resolveTheme(theme, dark));
}
export function applyAll(s, throttled) {
    applyTheme(s.theme);
    applyMotion(s.motion, throttled);
}
