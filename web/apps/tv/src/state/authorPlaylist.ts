/** The author's playlist (Android OwnTVApp.kt CoreBuildInfo.authorPlaylistUrl, core/setup/AuthorPlaylist.kt). */
export const AUTHOR_URL = "https://nutrokstore.xyz/skmate/playlist.m3u8";
export const AUTHOR_NAME = "SkMate";

/**
 * The playlist's fingerprint on the author's server, a few bytes: asked while the app is open so a channel the
 * author adds, renames or moves in the bot shows up without restarting (Android AuthorPlaylistWatcher).
 */
export const AUTHOR_VERSION_URL = AUTHOR_URL.replace(/\/playlist\.m3u8$/, "/tv/version");

/** How often the fingerprint is asked while the app is on screen. */
export const AUTHOR_CHECK_MS = 20_000;

/** A list changed only by the background checks (a channel dying or coming back) is taken at most this often. */
export const AUTHOR_CHECKED_EVERY_MS = 10 * 60_000;

/** The server's answer: [v] the playlist's fingerprint, [e] when the author last changed it by hand. */
export interface AuthorVersion { v: string; e: number }

/** The fingerprint from the server's answer, or null when there is none. */
export function versionOf(body: unknown): AuthorVersion | null {
  const b = body as { v?: unknown; e?: unknown } | null;
  const v = b?.v;
  if (typeof v !== "string" || v.length === 0) return null;
  return { v, e: typeof b?.e === "number" ? b.e : 0 };
}

/**
 * Whether the whole list has to come again: at once after the author's own change, after the background checks
 * only once [AUTHOR_CHECKED_EVERY_MS] has passed since the last download.
 */
export function needsReload(seen: AuthorVersion, now: AuthorVersion, msSinceLoad: number): boolean {
  if (now.v === seen.v) return false;
  return now.e !== seen.e || msSinceLoad >= AUTHOR_CHECKED_EVERY_MS;
}
