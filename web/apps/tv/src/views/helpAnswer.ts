/*
 * "Как пользоваться" answers read for their window (Android 2.5.4, features/more/HelpPage.kt HelpAnswer): the lines
 * (numbered steps, points, plain text), the path through the screens the answer starts with ("Настройки › Источники
 * каналов › «Добавить источник»"), drawn as a sketch, and the remote's keys it uses, lit on a drawn remote.
 */

export type LineKind = "path" | "heading" | "step" | "point" | "text" | "done";
export interface AnswerLine { kind: LineKind; mark: string; text: string }
export interface HelpAnswer { lines: AnswerLine[]; path: string[]; keys: string[] }

export const KEYS = ["◀", "▶", "▲", "▼", "OK"];
export const OPEN_QUOTES = "«“„「『";
export const CLOSE_QUOTES = "»”“」』";
const STEP = /^(\d+)\.\s+(.*)$/;
const POINT = "• ";
const DONE = "✓ ";
const HEADING_MAX = 48;
const COLONS = ":：";
/** "Good to know:": a short line that ends in a colon and says nothing after it heads what follows. */
const isHeading = (line: string) => line.length <= HEADING_MAX && COLONS.indexOf(line.charAt(line.length - 1)) >= 0
  && line.slice(0, -1).split("").every((c) => COLONS.indexOf(c) < 0);

/**
 * 2.5.7 (HelpPage.kt plain): every answer laid out the same way: where to go, the steps numbered one after another
 * (also across what were separate blocks), and one closing paragraph that gathers the points and the conclusion.
 * Headings are left out: the steps and the paragraph say it plainly.
 */
function plain(lines: AnswerLine[]): AnswerLine[] {
  const out: AnswerLine[] = [];
  const closing: string[] = [];
  let step = 0;
  for (const line of lines) {
    if (line.kind === "step") { step++; out.push({ kind: "step", mark: String(step), text: line.text }); }
    else if (line.kind === "point" || line.kind === "done") closing.push(line.text);
    else if (line.kind !== "heading") out.push(line);
  }
  if (closing.length > 0) out.push({ kind: "done", mark: "", text: closing.join(" ") });
  return out;
}
const SEP = " › ";
const LEAD_MARK = /^(?:\d+\.\s+|•\s+)/;
/** How far into the answer a path may start: a path that only comes up at the end matters less than the keys. */
const PATH_LINES = 2;
const SENTENCE_STOPS = ".:;。：；";
// Kotlin Char.isLetterOrDigit for the scripts of the app's languages (no \p{L} before Chromium 64).
const LETTER_OR_DIGIT = /[0-9A-Za-zÀ-ɏͰ-ӿ֐-׿ؠ-ي٠-٩ٱ-ۓऀ-෿぀-ヿ㐀-鿿가-힯豈-﫿]/;

/** The answer's first line, without its step number or point mark: the hint under the question. */
export function plainFirstLine(answer: string): string {
  return (answer.split("\n")[0] ?? "").replace(LEAD_MARK, "");
}

/** "OK" only as a word of its own, not inside "OKKO". */
export function isWholeKey(text: string, at: number, key: string): boolean {
  if (key !== "OK") return true;
  const before = at > 0 ? text.charAt(at - 1) : "";
  const after = text.charAt(at + key.length);
  return (before === "" || !LETTER_OR_DIGIT.test(before)) && (after === "" || !LETTER_OR_DIGIT.test(after));
}

const startsAt = (text: string, part: string, at: number) => text.substr(at, part.length) === part;
const unquoted = (text: string) => text.split("").filter((c) => OPEN_QUOTES.indexOf(c) < 0 && CLOSE_QUOTES.indexOf(c) < 0).join("");
const afterLast = (s: string, d: string) => { const i = s.lastIndexOf(d); return i < 0 ? s : s.slice(i + d.length); };

/**
 * "Settings › Channel sources › «Add source»" in [line], step by step without the quotes: from the word just before
 * the first ›, which has to be where every path starts ([roots]: "Настройки", "Каналы"), to the end of the sentence.
 * A comma inside «quotes» belongs to the item ("«Turn off, keep it»").
 */
function pathIn(line: string, roots: ReadonlySet<string>): string[] | null {
  const at = line.indexOf(SEP);
  // The word right before the first ›, after a space or a colon (Chinese and Japanese write no spaces).
  const root = at < 0 ? "" : afterLast(afterLast(afterLast(line.slice(0, at).trim(), " "), "："), ":");
  if (!roots.has(root)) return null;
  let end = line.length;
  let close: string | null = null; // the quote that ends the item being read, while inside one
  for (let i = at; i < line.length; i++) {
    const c = line.charAt(i);
    const open = OPEN_QUOTES.indexOf(c);
    if (close !== null && c === close) close = null;
    else if (close === null && open >= 0) close = CLOSE_QUOTES.charAt(open);
    const stop = SENTENCE_STOPS.indexOf(c) >= 0 || (c === "," && line.charAt(i + 1) === " ");
    if (close === null && stop) { end = i; break; }
  }
  const rest = unquoted(line.slice(at + SEP.length, end));
  return [root, ...rest.split(SEP).map((x) => x.trim())].filter((x) => x !== "");
}

export function parseAnswer(answer: string, roots: ReadonlySet<string>): HelpAnswer {
  const raw = answer.split("\n").map((x) => x.trim()).filter((x) => x !== "");
  let path: string[] = [];
  for (const line of raw.slice(0, PATH_LINES)) { const p = pathIn(line, roots); if (p) { path = p; break; } }
  const bare = path.join(SEP);
  const lines = raw.map((line): AnswerLine => {
    // A line that is nothing but the path is where to go: picked out on its own.
    if (path.length > 0 && unquoted(line).replace(/\.+$/, "") === bare) return { kind: "path", mark: "", text: line };
    const step = STEP.exec(line);
    if (step) return { kind: "step", mark: step[1]!, text: step[2]! };
    if (line.indexOf(POINT) === 0) return { kind: "point", mark: "", text: line.slice(POINT.length) };
    if (line.indexOf(DONE) === 0) return { kind: "done", mark: "", text: line.slice(DONE.length) };
    if (isHeading(line)) return { kind: "heading", mark: "", text: line };
    return { kind: "text", mark: "", text: line };
  });
  const keys = KEYS.filter((k) => raw.some((line) => {
    for (let i = 0; i < line.length; i++) if (startsAt(line, k, i) && isWholeKey(line, i, k)) return true;
    return false;
  }));
  return { lines: plain(lines), path, keys };
}

/** Pieces of a line for drawing: the remote's keys and «menu items» picked out, the rest plain. */
export type Piece = { kind: "plain" | "key" | "item"; text: string };

export function highlight(text: string): Piece[] {
  const out: Piece[] = [];
  let plain = "";
  const flush = () => { if (plain) { out.push({ kind: "plain", text: plain }); plain = ""; } };
  let i = 0;
  while (i < text.length) {
    const key = KEYS.find((k) => startsAt(text, k, i) && isWholeKey(text, i, k));
    const quote = OPEN_QUOTES.indexOf(text.charAt(i));
    if (key) {
      flush(); out.push({ kind: "key", text: key }); i += key.length;
    } else if (quote >= 0) {
      const end = text.indexOf(CLOSE_QUOTES.charAt(quote), i + 1);
      if (end < 0) { plain += text.charAt(i); i++; } else { flush(); out.push({ kind: "item", text: text.slice(i, end + 1) }); i = end + 1; }
    } else {
      plain += text.charAt(i); i++;
    }
  }
  flush();
  return out;
}
