/** Which TV the page runs on; decides the key registration and the packaging, nothing else. */
export function detectPlatform(ua = navigator.userAgent) {
    if (/web0s|webos/i.test(ua))
        return "webos";
    if (/tizen/i.test(ua))
        return "tizen";
    return "browser";
}
/** Tizen delivers some remote keys only after they are registered. */
export function registerRemoteKeys(platform) {
    var _a;
    if (platform !== "tizen")
        return;
    const tizen = window.tizen;
    for (const key of ["MediaPlay", "MediaPause", "MediaStop", "MediaRewind", "MediaFastForward", "ChannelUp", "ChannelDown"]) {
        try {
            (_a = tizen === null || tizen === void 0 ? void 0 : tizen.tvinputdevice) === null || _a === void 0 ? void 0 : _a.registerKey(key);
        }
        catch ( /* an older Tizen has fewer keys */_b) { /* an older Tizen has fewer keys */ }
    }
}
