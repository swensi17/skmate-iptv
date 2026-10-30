export type PlatformId = "webos" | "tizen" | "browser";

/** Which TV the page runs on; decides the key registration and the packaging, nothing else. */
export function detectPlatform(ua: string = navigator.userAgent): PlatformId {
  if (/web0s|webos/i.test(ua)) return "webos";
  if (/tizen/i.test(ua)) return "tizen";
  return "browser";
}

interface TizenApi { tvinputdevice?: { registerKey(name: string): void } }

/** Tizen delivers some remote keys only after they are registered. */
export function registerRemoteKeys(platform: PlatformId): void {
  if (platform !== "tizen") return;
  const tizen = (window as unknown as { tizen?: TizenApi }).tizen;
  for (const key of ["MediaPlay", "MediaPause", "MediaStop", "MediaRewind", "MediaFastForward", "ChannelUp", "ChannelDown"]) {
    try { tizen?.tvinputdevice?.registerKey(key); } catch { /* an older Tizen has fewer keys */ }
  }
}
