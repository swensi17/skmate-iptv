/*
 * Settings › Внешний вид applied to the whole web app the way Android applies them to the whole Compose tree:
 *  - Font size 60–140 % scales every text (Android: root Density.fontScale), popup font size 50–120 % replaces it
 *    inside popups (OwnTVPopup.kt), popup size 50–120 % scales the whole popup card (OwnTVPopup density).
 *  - Animation speed: fast 0.6, normal 1.0, slow 1.5 times every duration (ui/theme/MotionPrefs.kt Speed).
 * The stylesheets are written in fixed px and ms, so they are taken once as they load: every font size becomes
 * `calc(Npx * var(--fs, 1))` (a var, so a popup can set its own), and every duration is kept and rewritten for the
 * speed. Nothing changes layout boxes (dp in Android): only text and time.
 */

/** Android MotionPrefs.Speed factors. */
/** The text scale at 100 %. */
export const TEXT_BASE = 1.08;

export const MOTION_FACTOR = { fast: 0.6, normal: 1, slow: 1.5 } as const;

const FS = "var(--fs, 1)";
const PX = /^(-?\d*\.?\d+)px$/;

/** A font-size value made scalable: "20px" → "calc(20px * var(--fs, 1))"; anything else (em, %, keywords, done) as it is. */
export function scalableSize(v: string): string | null {
  const m = PX.exec(v.trim());
  return m ? `calc(${m[1]}px * ${FS})` : null;
}

/** The size inside a `font` shorthand made scalable: "600 20px var(--st-font)" → "600 calc(20px * var(--fs, 1)) var(--st-font)". */
export function scalableFont(v: string): string | null {
  if (v.indexOf("--fs") >= 0) return null;
  const m = /(^|\s)(\d*\.?\d+)px(?=\s|\/|$)/.exec(v);
  if (!m) return null;
  const at = m.index + m[1]!.length;
  return `${v.slice(0, at)}calc(${m[2]}px * ${FS})${v.slice(at + m[2]!.length + 2)}`;
}

/** Every time in a duration list scaled: "300ms, 0.2s" × 1.5 → "450ms, 300ms". */
export function scaleTimes(v: string, k: number): string {
  // A time stands alone (at the start, after a space, a comma or a bracket): "spin2s" is a name, not a time.
  return v.replace(/(^|[\s,(])(\d*\.?\d+)(ms|s)(?![\w-])/g,
    (_, pre: string, n: string, unit: string) => `${pre}${Math.round(parseFloat(n) * (unit === "s" ? 1000 : 1) * k)}ms`);
}

interface Times { rule: CSSStyleRule; props: Array<[string, string, string]> }

const seen = typeof WeakSet === "function" ? new WeakSet<CSSStyleSheet>() : null;
const timed: Times[] = [];
let factor = 1;

function rulesOf(list: CSSRuleList, out: CSSStyleRule[]): void {
  for (let i = 0; i < list.length; i++) {
    const r = list[i] as CSSRule & { cssRules?: CSSRuleList; style?: CSSStyleDeclaration };
    if (r.type === 1) out.push(r as CSSStyleRule);
    else if (r.cssRules) rulesOf(r.cssRules, out); // @media, @supports
  }
}

function prepare(rule: CSSStyleRule): void {
  const st = rule.style;
  const size = st.getPropertyValue("font-size");
  const fixed = size ? scalableSize(size) : null;
  if (fixed) st.setProperty("font-size", fixed, st.getPropertyPriority("font-size"));
  else if (!size) {
    // A `font` shorthand with a var() in it keeps its longhands empty until it is drawn: rewrite the shorthand.
    const font = st.getPropertyValue("font");
    const next = font ? scalableFont(font) : null;
    if (next) st.setProperty("font", next, st.getPropertyPriority("font"));
  }
  const props: Array<[string, string, string]> = [];
  for (const what of ["transition", "animation"]) {
    if (st.getPropertyValue(`${what}-duration`)) {
      for (const name of [`${what}-duration`, `${what}-delay`]) {
        const v = st.getPropertyValue(name);
        if (v && v.indexOf("var(") < 0 && /\d/.test(v)) props.push([name, v, st.getPropertyPriority(name)]);
      }
      continue;
    }
    // A shorthand with a var() in it (the easing token) keeps its longhands empty: its times are scaled in place.
    const sh = st.getPropertyValue(what);
    if (sh && /\dm?s/.test(sh)) props.push([what, sh, st.getPropertyPriority(what)]);
  }
  for (let i = 0; i < st.length; i++) {
    const name = st[i]!;
    if (name.indexOf("--") !== 0) continue;
    const v = st.getPropertyValue(name);
    if (/^\s*\d*\.?\d+m?s\s*$/.test(v)) props.push([name, v.trim(), st.getPropertyPriority(name)]);
  }
  if (props.length > 0) {
    const t: Times = { rule, props };
    timed.push(t);
    if (factor !== 1) speed(t);
  }
}

function speed(t: Times): void {
  for (const [name, v, prio] of t.props) t.rule.style.setProperty(name, scaleTimes(v, factor), prio);
}

/** Takes every stylesheet not yet taken (the app's, and those a lazy screen brings later). */
function scan(): void {
  if (typeof document === "undefined") return;
  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i] as CSSStyleSheet;
    if (seen?.has(sheet)) continue;
    let list: CSSRuleList;
    try { list = sheet.cssRules; } catch { continue; } // another origin's sheet: not ours to change
    seen?.add(sheet);
    const rules: CSSStyleRule[] = [];
    rulesOf(list, rules);
    rules.forEach(prepare);
  }
}

let watching = false;
function watch(): void {
  if (watching || typeof MutationObserver !== "function" || typeof document === "undefined") return;
  watching = true;
  let queued = false;
  const later = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; scan(); }, 0); };
  new MutationObserver(later).observe(document.head, { childList: true, subtree: true, characterData: true });
  document.addEventListener("load", (e) => { if ((e.target as Element | null)?.tagName === "LINK") later(); }, true);
}

/** Sets a custom property only when it changes: --fs feeds every font size, so a needless write restyles the page. */
export function setVar(root: HTMLElement, name: string, value: string | null): void {
  const now = root.style.getPropertyValue(name);
  if (value === null) { if (now) root.style.removeProperty(name); return; }
  if (now !== value) root.style.setProperty(name, value);
}

export interface Look {
  fontSize: number;
  popupFontSize: number;
  popupSize: number;
  motionSpeed: keyof typeof MOTION_FACTOR;
}

/** Applies the text sizes, the popup size and the animation speed; cheap when nothing changed. */
export function applyLook(l: Look, root: HTMLElement = document.documentElement): void {
  scan();
  watch();
  const pctOf = (n: number, a: number, b: number) => String(Math.max(a, Math.min(b, n)) / 100);
  // 100 % is a little larger than the design sizes (2.7.1): easier to read from the sofa.
  setVar(root, "--fs", String(Math.round(Number(pctOf(l.fontSize, 60, 140)) * TEXT_BASE * 1000) / 1000));
  setVar(root, "--fs-popup", pctOf(l.popupFontSize, 50, 120));
  setVar(root, "--popup-zoom", pctOf(l.popupSize, 50, 120));
  const k = MOTION_FACTOR[l.motionSpeed] ?? 1;
  if (k !== factor) {
    factor = k;
    timed.forEach(speed);
  }
}

/** The font families Android offers, as CSS stacks. Only Plus Jakarta Sans (and Roboto's Cyrillic) are bundled in the web app. */
export function fontStack(id: string): string | null {
  switch (id) {
    case "SYSTEM_SANS": return `Roboto, "Samsung One", "SamsungOneUI", "LG Smart UI", "Segoe UI", Arial, sans-serif`;
    case "MONOSPACE": return `"JetBrains Mono", "Roboto Mono", "DejaVu Sans Mono", monospace`;
    case "LORA": return `Lora, Georgia, "Times New Roman", serif`;
    case "PLAYFAIR_DISPLAY": return `"Playfair Display", Georgia, "Times New Roman", serif`;
    case "DANCING_SCRIPT": return `"Dancing Script", "Comic Sans MS", cursive`;
    case "POPPINS": return `Poppins, Roboto, "Samsung One", Arial, sans-serif`;
    default: return null; // PLUS_JAKARTA_SANS: the stack in tokens.css
  }
}

/** Focus highlight presets (SettingsScreen.kt FocusColorPresets): "" = the accent's own, then yellow, white, the six accents (dark primaries). */
export const FOCUS_PRESETS: Array<{ hex: string; key: string }> = [
  { hex: "", key: "sa_settings_subtitle_default" },
  { hex: "#F5B400", key: "sa_settings_clock_color_yellow" },
  { hex: "#FFFFFF", key: "sa_settings_clock_color_white" },
  { hex: "#52DBC8", key: "sa_settings_accent_teal" },
  { hex: "#6FB0FF", key: "sa_settings_accent_blue" },
  { hex: "#CBBEFF", key: "sa_settings_accent_violet" },
  { hex: "#6FDB94", key: "sa_settings_accent_green" },
  { hex: "#FFB95C", key: "sa_settings_accent_amber" },
  { hex: "#F2F0ED", key: "sa_settings_accent_ink" },
];
