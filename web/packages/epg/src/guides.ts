import data from "./guides.json";

export interface DefaultGuide { name: string; url: string; logos?: boolean }
interface Provider { name: string; hosts: string[]; guides: string[] }

const providers = data.providers as Provider[];
const shared = data.shared as DefaultGuide[];

/** The guides added for every playlist to fill the channels its own guide lacks (Settings › EPG catalog shows them on). */
export const SHARED_GUIDES: readonly DefaultGuide[] = shared;

/** The host of a URL without "www.", or null. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return new URL(url.trim().split("|")[0] as string).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

/** The provider whose host is the playlist's host or one of its parent domains. */
export function providerFor(playlistUrl: string | null | undefined): Provider | null {
  const host = hostOf(playlistUrl);
  if (!host) return null;
  return providers.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
}

/**
 * The guides a playlist gets without the user typing an address, in priority order and without repeats: its own
 * (`url-tvg` in its header), else its provider's, then the shared guides that fill the channels the first lack.
 */
export function guidesForPlaylist(playlistName: string, playlistUrl: string | null, own: readonly string[], withShared = true): DefaultGuide[] {
  const ownGuides = own.reduce<string[]>((all, o) => all.concat(o.split(",")), []).map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u));
  const first: DefaultGuide[] = ownGuides.length > 0
    ? ownGuides.map((url) => ({ name: playlistName, url }))
    : (providerFor(playlistUrl)?.guides ?? []).map((url) => ({ name: providerFor(playlistUrl)?.name ?? playlistName, url }));
  // The same feed named twice ("epg.xml.gz" in url-tvg and "epg.xml" in x-tvg-url, say) is one guide: the first stays.
  const key = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\.gz(\?.*)?$/, "$1");
  const seen = new Set<string>();
  return [...first, ...(withShared ? shared : [])].filter((g) => (seen.has(key(g.url)) ? false : (seen.add(key(g.url)), true)));
}
