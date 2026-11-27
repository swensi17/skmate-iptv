import a1 from "./assets/avatars/a1.svg";
import a2 from "./assets/avatars/a2.svg";
import a3 from "./assets/avatars/a3.svg";
import a4 from "./assets/avatars/a4.svg";
import a5 from "./assets/avatars/a5.svg";
import a6 from "./assets/avatars/a6.svg";
import a7 from "./assets/avatars/a7.svg";

/** The preset profile avatars (Android OwnTVAvatars.COUNT = 7); -1 is "no avatar" (the silhouette / the initial). */
export const AVATARS: readonly string[] = [a1, a2, a3, a4, a5, a6, a7];
export const AVATAR_COUNT = AVATARS.length;

/** The picture of an avatar id: an id outside the set wraps into it (OwnTVAvatar.kt); null for "no avatar". */
export function avatarSrc(id: number | undefined): string | null {
  if (id === undefined || id < 0) return null;
  return AVATARS[((id % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT] ?? null;
}
