/**
 * Profiles: each person (or the guest) has their own playlists, favourites and cached guide, kept under keys that end
 * with the profile's id. The first profile ("main") keeps the plain keys, so what was stored before profiles
 * existed stays with it. Settings (theme, language, player) are the TV's, shared by everyone.
 */
export interface Profile { id: string; name: string; guest?: boolean }
export interface ProfileBook { profiles: Profile[]; activeId: string }

const KEY = "skmate.profiles.v1";
const MAIN = "main";

export function loadBook(): ProfileBook | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<ProfileBook> | null;
    if (!raw || !Array.isArray(raw.profiles) || raw.profiles.length === 0) return null;
    const profiles = raw.profiles.filter((p): p is Profile => !!p && typeof p.id === "string" && typeof p.name === "string");
    if (profiles.length === 0) return null;
    return { profiles, activeId: profiles.some((p) => p.id === raw.activeId) ? (raw.activeId as string) : (profiles[0] as Profile).id };
  } catch {
    return null;
  }
}

export function saveBook(book: ProfileBook): void {
  try { localStorage.setItem(KEY, JSON.stringify(book)); } catch { /* the choice is just not remembered */ }
}

let scope = loadBook()?.activeId ?? MAIN;

/** A storage key of the active profile. */
export function scoped(base: string): string {
  return scope === MAIN ? base : `${base}@${scope}`;
}

export function firstBook(name: string, guest: boolean): ProfileBook {
  return { profiles: [{ id: MAIN, name, ...(guest ? { guest: true } : {}) }], activeId: MAIN };
}

export function addProfile(book: ProfileBook, name: string): ProfileBook {
  const trimmed = name.trim();
  if (trimmed === "") return book;
  let n = book.profiles.length;
  while (book.profiles.some((p) => p.id === `p${n}`)) n++;
  return { ...book, profiles: [...book.profiles, { id: `p${n}`, name: trimmed }] };
}

/** The active profile cannot be removed (the app would be left without one); the others can. */
export function removeProfile(book: ProfileBook, id: string): ProfileBook {
  if (id === book.activeId) return book;
  return { ...book, profiles: book.profiles.filter((p) => p.id !== id) };
}

export function switchProfile(book: ProfileBook, id: string): ProfileBook {
  return book.profiles.some((p) => p.id === id) ? { ...book, activeId: id } : book;
}

/** Forgets everything a removed profile kept. */
export function purgeProfile(id: string): void {
  if (id === MAIN) return;
  try {
    const suffix = `@${id}`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.endsWith(suffix)) localStorage.removeItem(k);
    }
  } catch { /* nothing to purge */ }
}
