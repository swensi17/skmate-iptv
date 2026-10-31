export interface Channel {
  /** Stable within one playlist: the position of the entry, so reloads keep favourites in place. */
  id: string;
  name: string;
  url: string;
  group: string;
  logo?: string;
  tvgId?: string;
  tvgName?: string;
  /** Lines like `#EXTVLCOPT:http-user-agent=…` that precede the URL. */
  headers?: Record<string, string>;
}

const ATTR = /([\w-]+)="([^"]*)"/g;

function attrs(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR.lastIndex = 0;
  while ((m = ATTR.exec(line)) !== null) out[(m[1] as string).toLowerCase()] = m[2] as string;
  return out;
}

/** The title after the first comma outside quotes (names may contain commas themselves). */
function titleOf(info: string): string {
  let inQuotes = false;
  let at = -1;
  for (let i = 0; i < info.length; i++) {
    const c = info[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === "," && !inQuotes) { at = i; break; }
  }
  return at < 0 ? "" : info.slice(at + 1).trim();
}

const HEADER_OPTS: Record<string, string> = {
  "http-user-agent": "User-Agent",
  "http-referrer": "Referer",
  "http-referer": "Referer",
};

/** Parses an M3U / M3U8 playlist; lines it does not understand are skipped, never fatal. */
export function parseM3U(text: string): Channel[] {
  const channels: Channel[] = [];
  let info: string | null = null;
  let group = "";
  let headers: Record<string, string> = {};
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    if (line.startsWith("#EXTINF:")) {
      info = line.slice(8);
      group = attrs(info)["group-title"] ?? "";
      headers = {};
    } else if (line.startsWith("#EXTGRP:")) {
      if (group === "") group = line.slice(8).trim();
    } else if (line.startsWith("#EXTVLCOPT:")) {
      const eq = line.indexOf("=");
      const key = HEADER_OPTS[line.slice(11, eq).toLowerCase()];
      if (key && eq > 0) headers[key] = line.slice(eq + 1).trim();
    } else if (line.startsWith("#")) {
      continue;
    } else if (info !== null) {
      const a = attrs(info);
      const name = titleOf(info) || a["tvg-name"] || line;
      const channel: Channel = { id: String(channels.length), name, url: line, group };
      if (a["tvg-logo"]) channel.logo = a["tvg-logo"];
      if (a["tvg-id"]) channel.tvgId = a["tvg-id"];
      if (a["tvg-name"]) channel.tvgName = a["tvg-name"];
      if (Object.keys(headers).length > 0) channel.headers = headers;
      channels.push(channel);
      info = null;
      headers = {};
    }
  }
  return channels;
}

/** Channels grouped by `group-title`, groups in playlist order. */
export function groupsOf(channels: readonly Channel[]): Array<{ name: string; channels: Channel[] }> {
  const map = new Map<string, Channel[]>();
  for (const c of channels) {
    const list = map.get(c.group) ?? [];
    list.push(c);
    map.set(c.group, list);
  }
  return Array.from(map, ([name, list]) => ({ name, channels: list }));
}

/** Guide addresses named in the playlist's first line: `#EXTM3U url-tvg="a,b" x-tvg-url="c"`. */
export function guidesInHeader(text: string): string[] {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  if (!first.startsWith("#EXTM3U")) return [];
  const a = attrs(first);
  return [a["url-tvg"], a["x-tvg-url"], a["tvg-url"]]
    .filter((v): v is string => !!v)
    .reduce<string[]>((all, v) => all.concat(v.split(",")), [])
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
}
