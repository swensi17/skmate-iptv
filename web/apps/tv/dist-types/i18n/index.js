import { en } from "./en";
import { ru } from "./ru";
const tables = { ru, en };
function pick() {
    var _a;
    const lang = (typeof navigator !== "undefined" ? navigator.language : "ru").slice(0, 2).toLowerCase();
    return (_a = tables[lang]) !== null && _a !== void 0 ? _a : en;
}
let table = pick();
/** For tests and a future language switch. */
export function setLanguage(lang) {
    var _a;
    table = (_a = tables[lang]) !== null && _a !== void 0 ? _a : en;
}
export function t(key, vars) {
    const raw = table[key];
    if (!vars)
        return raw;
    return raw.replace(/\{(\w+)\}/g, (_, k) => { var _a; return String((_a = vars[k]) !== null && _a !== void 0 ? _a : ""); });
}
