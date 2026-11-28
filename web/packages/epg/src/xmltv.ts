export interface Programme { start: number; stop: number; title: string; desc?: string | undefined }
export interface GuideChannel { id: string; names: string[]; /** The channel's logo address, when the guide gives one. */ icon?: string }

export interface XmltvHandlers {
  onChannel(channel: GuideChannel): void;
  onProgramme(channelId: string, programme: Programme): void;
  /**
   * Whether a programme of [channelId] from [start] to [stop] is wanted at all. A guide of thousands of channels is
   * read for the few hundred a playlist has: the rest is skipped before its title and description are decoded.
   */
  keep?(channelId: string, start: number, stop: number): boolean;
}

/** The [len]-digit number at [at] in [s], or -1 when those are not all digits. */
function digits(s: string, at: number, len: number): number {
  if (at + len > s.length) return -1;
  let v = 0;
  for (let i = at; i < at + len; i++) {
    const c = s.charCodeAt(i) - 48;
    if (c < 0 || c > 9) return -1;
    v = v * 10 + c;
  }
  return v;
}

const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 13;

/**
 * XMLTV time "20261031053000 +0300" as epoch milliseconds; without an offset it is UTC. Read digit by digit: a guide
 * has two per programme, hundreds of thousands of them, and a regular expression was a large part of the time.
 */
export function parseXmltvTime(text: string): number | null {
  let i = 0;
  while (i < text.length && isSpace(text.charCodeAt(i))) i++;
  const y = digits(text, i, 4);
  const mo = digits(text, i + 4, 2);
  const d = digits(text, i + 6, 2);
  if (y < 0 || mo < 0 || d < 0) return null;
  i += 8;
  const part = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const v = digits(text, i, 2);
    if (v < 0) break;
    part[k] = v;
    i += 2;
  }
  let t = Date.UTC(y, mo - 1, d, part[0] as number, part[1] as number, part[2] as number);
  while (i < text.length && isSpace(text.charCodeAt(i))) i++;
  const sign = text[i];
  if (sign === "+" || sign === "-") {
    const oh = digits(text, i + 1, 2);
    const colon = text[i + 3] === ":" ? 1 : 0;
    const om = digits(text, i + 3 + colon, 2);
    if (oh >= 0 && om >= 0) t -= (sign === "-" ? -1 : 1) * (oh * 60 + om) * 60_000;
  }
  return t;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  // Most titles have neither an entity nor CDATA: no regular expression for them.
  if (s.indexOf("&") < 0 && s.indexOf("<!") < 0) return s.trim();
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : all;
      }
      return ENTITIES[e.toLowerCase()] ?? all;
    })
    .trim();
}

/** The value of attribute [name] in an opening [tag] (` name="…"`), found by search, not a new RegExp per call. */
const attr = (tag: string, name: string): string | null => {
  const key = `${name}="`;
  let at = tag.indexOf(key);
  while (at > 0 && !isSpace(tag.charCodeAt(at - 1))) at = tag.indexOf(key, at + 1);
  if (at <= 0) return null;
  const from = at + key.length;
  const to = tag.indexOf('"', from);
  return to < 0 ? null : decodeEntities(tag.slice(from, to));
};

const inner = (xml: string, tag: string): string | null => {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? decodeEntities(m[1] as string) : null;
};

/**
 * Reads XMLTV as it arrives, chunk by chunk, so a guide of tens of megabytes never sits in memory whole:
 * each complete `<channel>` or `<programme>` is handed on and forgotten. It is not an XML parser, it
 * knows exactly these two elements, which is all a guide is made of.
 */
export class XmltvScanner {
  private buf = "";
  /** True once the first programme was seen: all channels of a guide come before its programmes. */
  sawProgramme = false;

  constructor(private readonly handlers: XmltvHandlers) {}

  feed(chunk: string): void {
    this.buf += chunk;
    let pos = 0;
    let cut = 0;
    // Where the next of each element starts. Each is searched again only once passed: a guide has all its channels
    // first, and searching the rest of the piece for one more `<channel ` before every programme cost most of the time.
    let ic = -2;
    let ip = -2;
    for (;;) {
      if (ic !== -1 && ic < pos) ic = this.buf.indexOf("<channel ", pos);
      if (ip !== -1 && ip < pos) ip = this.buf.indexOf("<programme ", pos);
      const isChannel = ic >= 0 && (ip < 0 || ic < ip);
      const start = isChannel ? ic : ip;
      if (start < 0) { cut = Math.max(pos, this.buf.length - 16); break; } // nothing open: keep only what could begin a tag
      const closer = isChannel ? "</channel>" : "</programme>";
      const end = this.buf.indexOf(closer, start);
      if (end < 0) { cut = start; break; } // an element still arriving: keep it whole
      const element = this.buf.slice(start, end + closer.length);
      if (isChannel) this.channel(element);
      else this.programme(element);
      pos = end + closer.length;
    }
    this.buf = this.buf.slice(cut);
  }

  private channel(el: string): void {
    const open = el.slice(0, el.indexOf(">") + 1);
    const id = attr(open, "id");
    if (!id) return;
    const names: string[] = [];
    const re = /<display-name(?:\s[^>]*)?>([\s\S]*?)<\/display-name>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(el)) !== null) names.push(decodeEntities(m[1] as string));
    const icon = /<icon\s[^>]*src="([^"]+)"/.exec(el);
    this.handlers.onChannel({ id, names, ...(icon ? { icon: decodeEntities(icon[1] as string) } : {}) });
  }

  private programme(el: string): void {
    this.sawProgramme = true;
    const open = el.slice(0, el.indexOf(">") + 1);
    const channel = attr(open, "channel");
    const start = parseXmltvTime(attr(open, "start") ?? "");
    const stop = parseXmltvTime(attr(open, "stop") ?? "");
    if (!channel || start === null || stop === null) return;
    if (this.handlers.keep && !this.handlers.keep(channel, start, stop)) return;
    const title = noPictographs(inner(el, "title") ?? "");
    if (!title) return;
    const rawDesc = inner(el, "desc");
    const desc = rawDesc ? noPictographs(rawDesc) || undefined : undefined;
    this.handlers.onProgramme(channel, { start, stop, title, desc });
  }
}

/**
 * A guide's emoji and pictographs taken out (sports channels put a skier or a ball before titles): a TV's own font has
 * none of them and draws a crossed box instead (#924). Plain ranges, no \p{} classes: Chromium 53 has no such regex.
 */
// Emoji (surrogate pairs), arrows (►, ⇒, #948 "Televizo shows little arrows"), geometric shapes, symbols and dingbats,
// private-use glyphs, joiners and variation selectors.
const PICTOGRAPHS = /(?:[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2190-\u21FF]|[\u2300-\u23FF]|[\u25A0-\u27BF]|[\u2900-\u297F]|[\u2B00-\u2BFF]|[\uE000-\uF8FF]|[\uFE0E\uFE0F\u200B-\u200D\u20E3])/g;
export function noPictographs(text: string): string {
  const cleaned = text.replace(PICTOGRAPHS, "");
  return cleaned.length === text.length ? text : cleaned.replace(/\s{2,}/g, " ").trim();
}
