import { xtreamAccount } from "@skmate/core";

const known = new Map<string, Promise<number>>();

/**
 * How many streams the provider lets this playlist open at once: an Xtream login says so in `user_info.max_connections`.
 * 0 when unknown (an M3U link, a Stalker portal, a panel that does not say), which allows everything, as on Android.
 */
export function maxConnections(url: string): Promise<number> {
  const account = xtreamAccount(url);
  if (!account) return Promise.resolve(0);
  let p = known.get(url);
  if (!p) {
    p = fetch(`${account.base}/player_api.php?username=${encodeURIComponent(account.user)}&password=${encodeURIComponent(account.pass)}`)
      .then((r) => r.json() as Promise<{ user_info?: { max_connections?: string | number } }>)
      .then((j) => { const n = Number(j.user_info?.max_connections); return Number.isFinite(n) && n > 0 ? n : 0; })
      .catch(() => 0);
    known.set(url, p);
  }
  return p;
}
