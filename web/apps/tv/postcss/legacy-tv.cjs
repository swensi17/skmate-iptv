/*
 * PostCSS plugin: CSS fallbacks for the old TV browsers (webOS 4 = Chromium 53, Tizen 4 = 56, Tizen 5 = 63).
 * JS is lowered by @vitejs/plugin-legacy; this does the same for the stylesheets, at dev and at build time.
 *
 * What it adds (nothing is removed, a modern browser renders exactly as before):
 *  - flex `gap` (Chromium 84): margins on the children, scoped to `html.no-flex-gap` (set by a runtime test,
 *    see packages/ui/src/legacy.ts). The layout of every flex container is resolved over ALL the app's
 *    stylesheets, so `display`, `flex-direction`, `flex-wrap` and `gap` may come from different rules and files.
 *    The children's own margins are kept: every margin a rule sets is mirrored into `--nfg-t/r/b/l`, and the gap
 *    margins are `calc(gap + own)`. Text runs inside a flex box (an icon beside a label) cannot be selected, so the
 *    runtime marks an element beside a text run with `data-nfg="a"` (text after) / `"b"` (text before).
 *  - `inset` (87) -> top/right/bottom/left.
 *  - `gap` on a grid (66) -> `grid-gap`, and `display: grid` itself (57) -> a wrapping flex box under
 *    `@supports not (display: grid)` for `grid-template-columns: repeat(N, 1fr)`.
 *  - `aspect-ratio` (88) -> `@supports not (aspect-ratio: 1 / 1)`: padding-top box, the children laid over it.
 *  - `:has(.x)` (105) -> `.has-x` (the component sets that class), `:focus-within` (60) -> `[data-focus-within]`
 *    (set by the runtime), `::placeholder` (57) -> `::-webkit-input-placeholder`, each as a separate rule so the
 *    old browser does not drop the whole rule for one selector it does not know.
 *  - `hsl(var(--h) 38% 30%)` (space syntax, 65) -> `hsl(var(--h), 38%, 30%)`.
 *  - `overflow-wrap: anywhere` (80) -> also `word-break: break-word`.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const PREFIX_CLASS = "no-flex-gap";
const LAYOUT_PROPS = new Set(["display", "flex-direction", "flex-wrap", "flex-flow", "gap", "row-gap", "column-gap", "grid-gap", "grid-row-gap", "grid-column-gap"]);
const MARGIN_PROPS = new Set(["margin", "margin-top", "margin-right", "margin-bottom", "margin-left"]);

/* ---------------- selector helpers ---------------- */

/** Splits on a separator at the top level (outside (), [] and quotes). */
function splitTop(s, isSep) {
  const out = [];
  let depth = 0;
  let quote = null;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) { cur += ch; if (ch === quote && s[i - 1] !== "\\") quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (depth === 0 && isSep(ch)) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const splitList = (sel) => splitTop(sel, (c) => c === ",").map((s) => s.trim()).filter(Boolean);

/** Compound selectors of a complex selector, combinators dropped (the matching below is approximate on purpose). */
function compounds(sel) {
  const spaced = sel.replace(/\s*([>+~])\s*/g, " ");
  return splitTop(spaced, (c) => c === " ").map((s) => s.trim()).filter(Boolean);
}

/** One compound: `button.row.ch:focus[aria-pressed]::before` -> parts. */
function parseCompound(c) {
  const out = { tag: null, classes: [], ids: [], attrs: [], pseudos: [], pseudoEl: null };
  let i = 0;
  const ident = () => { const m = /^-?(?:[_a-zA-Z0-9-]|[^\x00-\x7f])+/.exec(c.slice(i)); const v = m ? m[0] : ""; i += v.length; return v; };
  if (c[0] === "*") i = 1;
  else if (/[a-zA-Z]/.test(c[0] || "")) out.tag = ident().toLowerCase();
  while (i < c.length) {
    const ch = c[i];
    if (ch === ".") { i++; out.classes.push(ident()); }
    else if (ch === "#") { i++; out.ids.push(ident()); }
    else if (ch === "[") { const end = c.indexOf("]", i); out.attrs.push(c.slice(i, end + 1).replace(/\s+/g, "")); i = end + 1; }
    else if (ch === ":") {
      const el = c[i + 1] === ":";
      i += el ? 2 : 1;
      let name = ident();
      if (c[i] === "(") {
        let depth = 0; const start = i;
        for (; i < c.length; i++) { if (c[i] === "(") depth++; else if (c[i] === ")") { depth--; if (depth === 0) { i++; break; } } }
        name += c.slice(start, i);
      }
      if (el || name === "before" || name === "after") out.pseudoEl = name; else out.pseudos.push(name);
    } else i++;
  }
  return out;
}

const subset = (a, b) => a.every((x) => b.includes(x));

/** Whether compound [a] holds for every element compound [b] holds for. */
function compoundCovers(a, b) {
  if (a.pseudoEl !== b.pseudoEl) return false;
  if (a.tag && a.tag !== b.tag) return false;
  return subset(a.classes, b.classes) && subset(a.ids, b.ids) && subset(a.attrs, b.attrs) && subset(a.pseudos, b.pseudos);
}

/** Whether selector [r] matches (at least) every element [g] matches: its subject covers g's subject, and each of
 *  its ancestors covers one of g's ancestors, in order. Approximate, which is enough to resolve a layout. */
function applies(r, g) {
  const rs = r.parts[r.parts.length - 1];
  const gs = g.parts[g.parts.length - 1];
  if (!compoundCovers(rs, gs)) return false;
  let j = 0;
  for (let i = 0; i < r.parts.length - 1; i++) {
    while (j < g.parts.length - 1 && !compoundCovers(r.parts[i], g.parts[j])) j++;
    if (j >= g.parts.length - 1) return false;
    j++;
  }
  return true;
}

function specificity(parts) {
  let a = 0; let b = 0; let c = 0;
  for (const p of parts) {
    a += p.ids.length;
    b += p.classes.length + p.attrs.length;
    for (const ps of p.pseudos) {
      const m = /^(not|is|has)\((.*)\)$/.exec(ps);
      if (m) { const inner = specificity(compounds(m[2]).map(parseCompound)); a += inner[0]; b += inner[1]; c += inner[2]; }
      else b++;
    }
    if (p.tag) c++;
    if (p.pseudoEl) c++;
  }
  return [a, b, c];
}

const cmpSpec = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

function parseSelector(text) {
  const parts = compounds(text).map(parseCompound);
  return { text, parts, spec: specificity(parts) };
}

/** `html.no-flex-gap` in front of a selector; merged into it when it starts at the root already. */
function scoped(sel, extra = "") {
  const m = /^(html|:root)(?=$|[\s.#[:>+~])/.exec(sel);
  if (m) return `${m[1]}.${PREFIX_CLASS}${extra}${sel.slice(m[1].length)}`;
  return `html.${PREFIX_CLASS}${extra} ${sel}`;
}

/* ---------------- value helpers ---------------- */

const splitValues = (v) => splitTop(v.trim(), (c) => c === " ").map((s) => s.trim()).filter(Boolean);

function expandMargin(prop, value) {
  if (prop !== "margin") return { [prop]: value };
  const v = splitValues(value);
  const [t, r = t, b = t, l = r] = v;
  return { "margin-top": t, "margin-right": r, "margin-bottom": b, "margin-left": l };
}

/** Layout declarations of a rule, shorthands expanded. */
function layoutDecls(prop, value) {
  switch (prop) {
    case "flex-flow": {
      const out = {};
      for (const v of splitValues(value)) {
        if (/^(row|column)(-reverse)?$/.test(v)) out["flex-direction"] = v;
        else if (/^(wrap|nowrap|wrap-reverse)$/.test(v)) out["flex-wrap"] = v;
      }
      return out;
    }
    case "gap": case "grid-gap": {
      const [r, c = r] = splitValues(value);
      return { "row-gap": r, "column-gap": c };
    }
    case "grid-row-gap": return { "row-gap": value };
    case "grid-column-gap": return { "column-gap": value };
    default: return { [prop]: value };
  }
}

const isZero = (v) => v === undefined || v === "normal" || /^0(px|em|rem|%)?$/.test(v);
const plain = (v) => (v === "normal" || v === undefined ? "0px" : /^0$/.test(v) ? "0px" : v);

/* ---------------- the model of all stylesheets ---------------- */

/** Every top-level rule of [root] (also inside @media / @supports), with its selectors parsed. */
function collect(root, file, model) {
  root.walkRules((rule) => {
    if (rule.parent && rule.parent.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
    const sels = splitList(rule.selector).map(parseSelector);
    const decls = [];
    rule.each((d) => { if (d.type === "decl") decls.push({ prop: d.prop.toLowerCase(), value: d.value, important: !!d.important }); });
    model.push({ file, rule, sels, decls, order: model.length });
  });
}

/** Resolves [props] for the elements [g] matches: every rule that applies, by importance, specificity, then order. */
function resolve(model, g, props, expand) {
  const hits = [];
  for (const entry of model) {
    let spec = null;
    for (const s of entry.sels) if (applies(s, g) && (!spec || cmpSpec(s.spec, spec) > 0)) spec = s.spec;
    if (!spec) continue;
    for (const d of entry.decls) {
      if (!props.has(d.prop)) continue;
      const vals = expand(d.prop, d.value);
      for (const k of Object.keys(vals)) hits.push({ k, v: vals[k], important: d.important, spec, order: entry.order });
    }
  }
  hits.sort((x, y) => (x.important === y.important ? 0 : x.important ? 1 : -1) || cmpSpec(x.spec, y.spec) || x.order - y.order);
  const out = {};
  for (const h of hits) out[h.k] = h.v;
  return out;
}

function layoutOf(model, g) {
  const l = resolve(model, g, LAYOUT_PROPS, layoutDecls);
  const display = (l.display || "").trim();
  return {
    flex: display === "flex" || display === "inline-flex",
    grid: display === "grid" || display === "inline-grid",
    column: /^column/.test(l["flex-direction"] || "row"),
    wrap: /^wrap/.test(l["flex-wrap"] || "nowrap"),
    rowGap: l["row-gap"],
    colGap: l["column-gap"],
  };
}

/* ---------------- the stylesheets on disk ---------------- */

function listCss(dir, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listCss(p, out);
    else if (e.name.endsWith(".css")) out.push(path.resolve(p));
  }
  return out;
}

/** The app's stylesheets in about the order the page loads them: the ones named in [first], then the rest by name. */
function stylesheets(dirs, first) {
  const all = [];
  for (const d of dirs) listCss(d, all);
  const rank = (f) => { const i = first.findIndex((n) => f.replace(/\\/g, "/").endsWith(n)); return i < 0 ? first.length : i; };
  return all.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

const sameFile = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/* ---------------- the plugin ---------------- */

/**
 * @param {{ dirs: string[], first?: string[] }} opts  [dirs]: folders whose .css files make up the app (scanned on
 *   every run, so the layout of a box is resolved over all of them); [first]: file name endings in load order.
 */
function legacyTv(opts) {
  const dirs = (opts && opts.dirs) || [];
  const first = (opts && opts.first) || [];
  const cache = new Map(); // file -> { mtime, root }

  return {
    postcssPlugin: "skmate-legacy-tv",
    Once(root, { postcss, result }) {
      const current = root.source && root.source.input && root.source.input.file;
      const files = stylesheets(dirs, first);
      const own = files.some((f) => sameFile(f, current));
      if (!own && current && !/\.css$/.test(current)) return;
      // The output depends on the other stylesheets: the dev server re-runs it when one of them changes.
      for (const f of files) {
        if (!sameFile(f, current)) result.messages.push({ type: "dependency", plugin: "skmate-legacy-tv", file: f, parent: current });
      }

      // 1. The model: every stylesheet of the app, this one as it is now (it may differ from the disk).
      const model = [];
      for (const f of files) {
        if (sameFile(f, current)) { collect(root, f, model); continue; }
        let parsed = null;
        try {
          const mtime = fs.statSync(f).mtimeMs;
          const hit = cache.get(f);
          if (hit && hit.mtime === mtime) parsed = hit.root;
          else { parsed = postcss.parse(fs.readFileSync(f, "utf8"), { from: f }); cache.set(f, { mtime, root: parsed }); }
        } catch { parsed = null; }
        if (parsed) collect(parsed, f, model);
      }
      if (!own) collect(root, current || "inline", model);
      const mine = model.filter((e) => e.rule.root() === root);

      // 2. Flex boxes: every selector that sets a layout property is a candidate; it gets a fallback when it is a flex
      //    box with a gap, or when a broader candidate's fallback reaches it and must be put right (gap 0, wrap, column).
      const candidates = new Map(); // selector text -> { sel, layout, anchor (last entry declaring it) }
      for (const entry of model) {
        if (!entry.decls.some((d) => LAYOUT_PROPS.has(d.prop))) continue;
        for (const s of entry.sels) {
          const subj = s.parts[s.parts.length - 1];
          if (!subj || subj.pseudoEl || /focus|has\(/.test(s.text)) continue;
          if (entry.rule.parent && entry.rule.parent.type === "atrule") continue;
          const c = candidates.get(s.text) || { sel: s, layout: null, anchor: entry };
          c.anchor = entry;
          candidates.set(s.text, c);
        }
      }
      for (const c of candidates.values()) c.layout = layoutOf(model, c.sel);
      const active = (c) => c.layout.flex && (!isZero(c.layout.rowGap) || !isZero(c.layout.colGap));
      const actives = [...candidates.values()].filter(active);
      const wraps = actives.filter((c) => !c.layout.column && c.layout.wrap);

      const emitted = new Map(); // anchor rule -> rules to put after it
      const after = (rule, nodes) => { const list = emitted.get(rule) || []; list.push(...nodes); emitted.set(rule, list); };
      const R = (selector, decls) => postcss.rule({ selector, nodes: decls.map(([prop, value, important]) => postcss.decl({ prop, value, important: !!important })) });

      for (const c of candidates.values()) {
        if (c.anchor.rule.root() !== root) continue;
        const L = c.layout;
        const reached = actives.some((o) => o !== c && applies(o.sel, c.sel));
        if (!active(c) && !reached) continue;
        const reachedByWrap = wraps.some((o) => o !== c && applies(o.sel, c.sel));
        const g = scoped(c.sel.text);
        const kids = `${g} > *`;
        const nodes = [];
        const own = { t: "var(--nfg-t)", r: "calc(var(--nfg-r) + var(--nfg-cr))", b: "calc(var(--nfg-b) + var(--nfg-cb))", l: "var(--nfg-l)" };
        if (!L.flex) {
          nodes.push(R(kids, [["margin", `${own.t} ${own.r} ${own.b} ${own.l}`, true]]));
          if (reachedByWrap) nodes.push(R(g, [["--nfg-cr", "0px"], ["--nfg-cb", "0px"]]));
          after(c.anchor.rule, nodes);
          continue;
        }
        const rg = plain(L.rowGap);
        const cg = plain(L.colGap);
        if (L.wrap && !L.column) {
          nodes.push(R(kids, [["margin", `${own.t} calc(${cg} + var(--nfg-r) + var(--nfg-cr)) calc(${rg} + var(--nfg-b) + var(--nfg-cb)) ${own.l}`, true]]));
          nodes.push(R(`${kids}[data-nfg~="b"]`, [["margin-left", `calc(${cg} + var(--nfg-l))`, true]]));
          nodes.push(R(g, [["--nfg-cr", `-${cg}`], ["--nfg-cb", `-${rg}`],
            ["margin-right", "calc(var(--nfg-r) + var(--nfg-cr))", true], ["margin-bottom", "calc(var(--nfg-b) + var(--nfg-cb))", true]]));
        } else {
          nodes.push(R(kids, [["margin", `${own.t} ${own.r} ${own.b} ${own.l}`, true]]));
          if (L.column) {
            nodes.push(R(`${kids} + *, ${kids}[data-nfg~="b"]`, [["margin-top", `calc(${rg} + var(--nfg-t))`, true]]));
            nodes.push(R(`${kids}[data-nfg~="a"]`, [["margin-bottom", `calc(${rg} + var(--nfg-b) + var(--nfg-cb))`, true]]));
          } else {
            nodes.push(R(`${kids} + *, ${kids}[data-nfg~="b"]`, [["margin-left", `calc(${cg} + var(--nfg-l))`, true]]));
            nodes.push(R(`${kids}[data-nfg~="a"]`, [["margin-right", `calc(${cg} + var(--nfg-r) + var(--nfg-cr))`, true]]));
          }
          if (reachedByWrap) nodes.push(R(g, [["--nfg-cr", "0px"], ["--nfg-cb", "0px"]]));
        }
        after(c.anchor.rule, nodes);
      }

      // 2b. An absolutely placed child is not a flex item: no gap before or after it. It keeps its own margins (a margin
      //     would move it), and when it comes first, the next child is the first in the flow and gets no gap either.
      //     `:not(#nfg)` lifts these over the gap rules above. Skipped when a narrower rule puts it back in the flow.
      if (actives.length > 0) {
        const placed = new Map();
        for (const entry of model) {
          if (!entry.decls.some((d) => d.prop === "position")) continue;
          if (entry.rule.parent && entry.rule.parent.type === "atrule") continue;
          for (const s of entry.sels) {
            const subj = s.parts[s.parts.length - 1];
            if (subj.pseudoEl || /:has\(|:focus-within/.test(s.text)) continue;
            placed.set(s.text, { sel: s, anchor: entry });
          }
        }
        const pos = (s) => resolve(model, s, new Set(["position"]), (p, v) => ({ [p]: v })).position || "static";
        const out = [...placed.values()].map((p) => ({ ...p, abs: /absolute|fixed/.test(pos(p.sel)) }));
        for (const p of out) {
          if (!p.abs || p.anchor.rule.root() !== root) continue;
          if (out.some((o) => o !== p && !o.abs && applies(p.sel, o.sel))) continue;
          const own = "var(--nfg-t) calc(var(--nfg-r) + var(--nfg-cr)) calc(var(--nfg-b) + var(--nfg-cb)) var(--nfg-l)";
          after(p.anchor.rule, [
            R(scoped(p.sel.text, ":not(#nfg)"), [["margin", own, true]]),
            R(scoped(`${p.sel.text}:first-child + *`, ":not(#nfg)"), [["margin-top", "var(--nfg-t)", true], ["margin-left", "var(--nfg-l)", true]]),
          ]);
        }
      }

      // 3. ::before / ::after of a flex box with a gap are flex items too: the gap goes on the pseudo-element.
      for (const entry of mine) {
        if (!entry.decls.some((d) => d.prop === "content")) continue;
        for (const s of entry.sels) {
          const subj = s.parts[s.parts.length - 1];
          if (!subj.pseudoEl || !/^(before|after)$/.test(subj.pseudoEl.replace(/^:/, ""))) continue;
          const pos = resolve(model, s, new Set(["position"]), (p, v) => ({ [p]: v })).position || "static";
          if (/absolute|fixed/.test(pos)) continue;
          const baseText = s.text.replace(/::?(before|after)\s*$/, "");
          const L = layoutOf(model, parseSelector(baseText));
          if (!L.flex) continue;
          const gap = L.column ? L.rowGap : L.colGap;
          if (isZero(gap)) continue;
          const side = subj.pseudoEl.endsWith("before") ? (L.column ? "margin-bottom" : "margin-right") : (L.column ? "margin-top" : "margin-left");
          after(entry.rule, [R(scoped(s.text), [[side, plain(gap), true]])]);
        }
      }

      // 4. Every margin a rule sets is mirrored into the --nfg-* variables, so the gap margins above can add to it.
      //    An `auto` margin cannot be added to: it is kept as it is, over the gap margins.
      if (files.length > 0 && sameFile(files[0], current)) {
        root.prepend(R(`html.${PREFIX_CLASS} *`, [["--nfg-t", "0px"], ["--nfg-r", "0px"], ["--nfg-b", "0px"], ["--nfg-l", "0px"], ["--nfg-cr", "0px"], ["--nfg-cb", "0px"]]));
      }
      for (const entry of mine) {
        const margins = {};
        let any = false;
        for (const d of entry.decls) {
          if (!MARGIN_PROPS.has(d.prop)) continue;
          if (/^(inherit|initial|unset|revert)$/.test(d.value.trim())) continue;
          Object.assign(margins, expandMargin(d.prop, d.value));
          any = true;
        }
        if (!any) continue;
        if (entry.rule.parent && entry.rule.parent.type === "atrule" && /keyframes$/i.test(entry.rule.parent.name)) continue;
        const sels = entry.sels.filter((s) => !s.parts[s.parts.length - 1].pseudoEl && !/:has\(|:focus-within|::?placeholder/.test(s.text));
        if (sels.length === 0) continue;
        const vars = [];
        const autos = [];
        for (const side of ["top", "right", "bottom", "left"]) {
          const v = margins[`margin-${side}`];
          if (v === undefined) continue;
          if (v.trim() === "auto") autos.push([`margin-${side}`, "auto", true]);
          else vars.push([`--nfg-${side[0]}`, /^0$/.test(v.trim()) ? "0px" : v]);
        }
        const nodes = [];
        if (vars.length) nodes.push(R(sels.map((s) => scoped(s.text)).join(", "), vars));
        if (autos.length) nodes.push(R(sels.map((s) => scoped(s.text, ":not(#nfg)")).join(", "), autos));
        after(entry.rule, nodes);
      }

      // 5. Per-declaration fixes, and selectors the old engines do not know.
      for (const entry of mine) {
        const rule = entry.rule;
        const extra = [];
        const L = entry.decls.some((d) => /gap$/.test(d.prop)) ? entry.sels.map((s) => layoutOf(model, s)) : [];
        const grid = L.some((l) => l.grid);
        rule.each((d) => {
          if (d.type !== "decl") return;
          const prop = d.prop.toLowerCase();
          if (prop === "inset") {
            const [t, r = t, b = t, l = r] = splitValues(d.value);
            for (const [p, v] of [["top", t], ["right", r], ["bottom", b], ["left", l]]) d.cloneBefore({ prop: p, value: v });
          } else if (grid && (prop === "gap" || prop === "row-gap" || prop === "column-gap")) {
            d.cloneBefore({ prop: `grid-${prop}` });
          } else if (prop === "overflow-wrap" && d.value.trim() === "anywhere" && !entry.decls.some((x) => x.prop === "word-break")) {
            d.cloneBefore({ prop: "word-break", value: "break-word" });
          }
          if (/\b(hsla?|rgba?)\(/i.test(d.value)) {
            const fixed = d.value.replace(/\b(hsla?|rgba?)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi, (all, fn, args) => {
              if (args.includes(",")) return all;
              const [main, alpha] = args.split("/");
              const parts = splitValues(main);
              if (parts.length !== 3) return all;
              const base = fn.toLowerCase().replace(/a$/, "");
              return alpha ? `${base}a(${parts.join(", ")}, ${alpha.trim()})` : `${base}(${parts.join(", ")})`;
            });
            if (fixed !== d.value) d.value = fixed;
          }
          if (prop === "aspect-ratio") {
            const m = /^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/.exec(d.value);
            if (m) {
              const pct = `${+((Number(m[2]) / Number(m[1])) * 100).toFixed(4)}%`;
              const sel = rule.selector;
              const kids = splitList(sel).map((s) => `${s} > *`).join(", ");
              const box = postcss.atRule({ name: "supports", params: "not (aspect-ratio: 1 / 1)" });
              box.append(R(sel, [["height", "0"], ["padding-top", pct], ["position", "relative"]]));
              box.append(R(kids, [["position", "absolute"]]));
              box.append(R(splitList(sel).map((s) => `${s} > :not([class*="spinner"])`).join(", "), [["top", "0"], ["left", "0"], ["width", "100%"], ["height", "100%"]]));
              extra.push(box);
            }
          }
        });
        // display: grid with repeat(N, 1fr) columns: a wrapping flex box where grid is unknown (Chromium < 57). Each cell
        // is 1px under a third and grows back to it, so rounding never pushes the third cell onto the next line.
        const display = entry.decls.find((d) => d.prop === "display");
        const cols = entry.decls.find((d) => d.prop === "grid-template-columns");
        if (display && /^(inline-)?grid$/.test(display.value.trim()) && cols) {
          const m = /^repeat\(\s*(\d+)\s*,\s*1fr\s*\)$/.exec(cols.value.trim());
          if (m) {
            const n = Number(m[1]);
            const gapDecl = entry.decls.filter((d) => /^(gap|grid-gap|row-gap|column-gap)$/.test(d.prop));
            const gv = gapDecl.reduce((acc, d) => Object.assign(acc, layoutDecls(d.prop, d.value)), {});
            const rg = plain(gv["row-gap"]);
            const cg = plain(gv["column-gap"]);
            const sel = splitList(rule.selector);
            const box = postcss.atRule({ name: "supports", params: "not (display: grid)" });
            box.append(R(sel.join(", "), [["display", "flex"], ["flex-wrap", "wrap"]]));
            box.append(R(sel.map((s) => `${s} > *`).join(", "), [["flex", "1 1 auto"], ["min-width", "0"], ["width", `calc((100% - ${n - 1} * ${cg}) / ${n} - 1px)`], ["margin", `0 0 0 ${cg}`]]));
            box.append(R(sel.map((s) => `${s} > :nth-child(${n}n+1)`).join(", "), [["margin-left", "0"]]));
            box.append(R(sel.map((s) => `${s} > :nth-child(n+${n + 1})`).join(", "), [["margin-top", rg]]));
            extra.push(box);
          }
        }
        // Selectors an old engine drops the whole rule for: the rule again with the known stand-in.
        const legacySel = splitList(rule.selector).map((s) => s
          .replace(/:has\(\s*\.([\w-]+)\s*\)/g, ".has-$1")
          .replace(/:focus-within/g, "[data-focus-within]")
          .replace(/::placeholder/g, "::-webkit-input-placeholder"));
        if (legacySel.join(", ") !== splitList(rule.selector).join(", ")) {
          const copy = rule.clone({ selector: legacySel.join(", ") });
          extra.unshift(copy);
        }
        if (extra.length) after(rule, extra);
      }

      for (const [rule, nodes] of emitted) {
        let at = rule;
        for (const n of nodes) { at.after(n); at = n; }
      }
    },
  };
}

legacyTv.postcss = true;
module.exports = legacyTv;
module.exports.default = legacyTv;
