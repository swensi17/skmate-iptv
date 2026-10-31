export interface Programme { start: number; stop: number; title: string; desc?: string | undefined }
export interface GuideChannel { id: string; names: string[] }

export interface XmltvHandlers {
  onChannel(channel: GuideChannel): void;
  onProgramme(channelId: string, programme: Programme): void;
}

/** XMLTV time "20261031053000 +0300" as epoch milliseconds; without an offset it is UTC. */
export function parseXmltvTime(text: string): number | null {
  const m = /^\s*(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?\s*(?:([+-])(\d{2}):?(\d{2}))?/.exec(text);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0", sign, oh = "0", om = "0"] = m;
  let t = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (sign) t -= (sign === "-" ? -1 : 1) * (Number(oh) * 60 + Number(om)) * 60_000;
  return t;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
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

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeEntities(m[1] as string) : null;
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
    for (;;) {
      const ic = this.buf.indexOf("<channel ", pos);
      const ip = this.buf.indexOf("<programme ", pos);
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
    this.handlers.onChannel({ id, names });
  }

  private programme(el: string): void {
    this.sawProgramme = true;
    const open = el.slice(0, el.indexOf(">") + 1);
    const channel = attr(open, "channel");
    const start = parseXmltvTime(attr(open, "start") ?? "");
    const stop = parseXmltvTime(attr(open, "stop") ?? "");
    if (!channel || start === null || stop === null) return;
    const title = inner(el, "title");
    if (!title) return;
    const desc = inner(el, "desc") ?? undefined;
    this.handlers.onProgramme(channel, { start, stop, title, desc });
  }
}
