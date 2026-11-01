export interface Channel {
  /** Stable within one playlist: the position of the entry, so reloads keep favourites in place. */
  id: string;
  name: string;
  url: string;
  group: string;
  logo?: string;
  tvgId?: string;
  tvgName?: string;
  /** Days of archive the provider keeps for this channel (`tvg-rec`, `catchup-days`); absent when none. */
  catchupDays?: number;
  /** `catchup` / `catchup-type`: append, shift, default, flussonic, xc… (legacy `timeshift="N"` is shift). */
  catchupType?: string;
  /** `catchup-source`: the archive URL template (see catchup.ts). */
  catchupSource?: string;
  /** `catchup-correction` in minutes: the entry's own, else the `#EXTM3U` line's. */
  catchupCorrectionMin?: number;
  /** Lines like `#EXTVLCOPT:http-user-agent=…` that precede the URL. */
  headers?: Record<string, string>;
  /** A film or an episode of a series rather than a channel (see [mediaOf]); absent for live TV. */
  media?: "movie" | "series";
}

/** Containers of a film file. `.ts`, `.m3u8`, `.mpd`, `.flv` are never here: those are how live TV comes. */
const PROGRESSIVE = new Set(["mp4", "m4v", "mkv", "avi", "mov", "wmv", "webm", "mpg", "mpeg"]);

/** An http(s), file or bare-path address of a film file, by the extension of its last path segment (Android's ProgressiveVideoUrl). */
export function isProgressiveVideoUrl(url: string): boolean {
  const u = url.split("|")[0]?.trim() ?? ""; // `7.mp4|User-Agent=Foo`: the headers suffix is not the file
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(u)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https" && scheme !== "file") return false;
  const path = u.replace(/[?#].*$/, "");
  const last = path.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  return dot > 0 && PROGRESSIVE.has(last.slice(dot + 1).toLowerCase());
}

/**
 * Film, series or live, as the Android app's M3uParser decides: only `type` / `tvg-type` count, and any of them wins
 * over the address (`tvg-type="live"` on an `.mp4` stays live); an entry with neither is a film when its address is
 * a film file. A name like "Show S01E05" alone does not make a series: that takes the tag.
 */
export function mediaOf(type: string | undefined, tvgType: string | undefined, url: string): "movie" | "series" | undefined {
  const t = type?.trim().toLowerCase() || undefined;
  const tt = tvgType?.trim().toLowerCase() || undefined;
  if (t === "series" || tt === "series") return "series";
  if (t === "vod" || t === "movie" || tt === "vod" || tt === "movie") return "movie";
  if (t === undefined && tt === undefined && isProgressiveVideoUrl(url)) return "movie";
  return undefined;
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

/** `catchup-correction` is in hours, maybe fractional or negative ("-1.5"); whole minutes, or undefined. */
function correctionMinutes(hours: string | undefined): number | undefined {
  if (hours === undefined || hours.trim() === "") return undefined;
  const h = Number(hours.trim());
  return Number.isFinite(h) ? Math.round(h * 60) : undefined;
}

/** Parses an M3U / M3U8 playlist; lines it does not understand are skipped, never fatal. */
export function parseM3U(text: string): Channel[] {
  const channels: Channel[] = [];
  let info: string | null = null;
  let group = "";
  let headers: Record<string, string> = {};
  let headerCorrection: number | undefined;
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    if (line.startsWith("#EXTM3U")) {
      headerCorrection = correctionMinutes(attrs(line)["catchup-correction"]);
    } else if (line.startsWith("#EXTINF:")) {
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
      // The Android app's rules (M3uParser): the newer attributes win over the legacy SIPTV `timeshift="N"`.
      const type = a["catchup"] ?? a["catchup-type"];
      const shiftDays = type === undefined ? Number(a["timeshift"] ?? 0) : 0;
      const days = Number(a["catchup-days"] ?? (shiftDays > 0 ? shiftDays : a["tvg-rec"] ?? 0));
      if (Number.isFinite(days) && days > 0) channel.catchupDays = days;
      const kind = type ?? (shiftDays > 0 ? "shift" : undefined);
      if (kind) channel.catchupType = kind;
      if (a["catchup-source"]) channel.catchupSource = a["catchup-source"];
      const correction = correctionMinutes(a["catchup-correction"]) ?? headerCorrection;
      if (correction) channel.catchupCorrectionMin = correction;
      if (Object.keys(headers).length > 0) channel.headers = headers;
      const media = mediaOf(a["type"], a["tvg-type"], line);
      if (media) channel.media = media;
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
