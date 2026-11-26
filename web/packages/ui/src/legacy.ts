/**
 * Runtime half of the old-TV support (webOS 4 = Chromium 53, Tizen 4 = 56, Tizen 5 = 63). The stylesheet half is
 * the PostCSS plugin in apps/tv/postcss/legacy-tv.cjs; JS syntax and core-js are done by @vitejs/plugin-legacy.
 * Each piece checks for the feature first, so a modern browser runs none of it.
 */

/** Flex `gap` (Chromium 84). `CSS.supports("gap", ...)` is true from 66 for grids only, so it is measured. */
export function supportsFlexGap(doc: Document = document): boolean {
  const box = doc.createElement("div");
  box.style.cssText = "display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden";
  box.appendChild(doc.createElement("div"));
  box.appendChild(doc.createElement("div"));
  (doc.body || doc.documentElement).appendChild(box);
  const ok = box.scrollHeight === 1;
  box.remove();
  return ok;
}

function supportsSelector(doc: Document, sel: string): boolean {
  try { doc.querySelector(sel); return true; } catch { return false; }
}

const hasText = (start: Node | null, next: (n: Node) => Node | null): boolean => {
  for (let n = start; n && n.nodeType !== 1; n = next(n)) if (n.nodeType === 3 && /\S/.test((n as Text).data)) return true;
  return false;
};

/**
 * A text run inside a flex box (an icon and its label) is a flex item the stylesheet cannot select, so the gap
 * beside it cannot be a margin on it. The element next to it gets `data-nfg`: "a" when text follows it, "b" when
 * text comes before it; the fallback rules put the gap on that side of the element instead.
 */
function markTextNeighbours(el: Element): void {
  const a = hasText(el.nextSibling, (n) => n.nextSibling);
  const b = hasText(el.previousSibling, (n) => n.previousSibling);
  const v = a && b ? "a b" : a ? "a" : b ? "b" : "";
  const was = el.getAttribute("data-nfg");
  if (v && was !== v) el.setAttribute("data-nfg", v);
  else if (!v && was !== null) el.removeAttribute("data-nfg");
}

function markChildren(parent: Node | null): void {
  if (!parent || parent.nodeType !== 1) return;
  for (let c = (parent as Element).firstElementChild; c; c = c.nextElementSibling) markTextNeighbours(c);
}

function markTree(root: Element): void {
  markTextNeighbours(root);
  const all = root.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) markTextNeighbours(all[i] as Element);
}

function watchTextNeighbours(root: Element): void {
  markTree(root);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") { markChildren(r.target.parentNode); continue; }
      markChildren(r.target);
      for (let i = 0; i < r.addedNodes.length; i++) {
        const n = r.addedNodes[i] as Node;
        if (n.nodeType === 1) markTree(n as Element);
      }
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}

/** `:focus-within` (Chromium 60): the focused element's ancestors carry `data-focus-within` instead. */
function polyfillFocusWithin(doc: Document): void {
  let marked: Element[] = [];
  const update = () => {
    const chain: Element[] = [];
    for (let el = doc.activeElement; el && el !== doc.documentElement; el = el.parentElement) chain.push(el);
    for (const el of marked) if (chain.indexOf(el) < 0) el.removeAttribute("data-focus-within");
    for (const el of chain) if (!el.hasAttribute("data-focus-within")) el.setAttribute("data-focus-within", "");
    marked = chain;
  };
  doc.addEventListener("focusin", update, true);
  doc.addEventListener("focusout", () => setTimeout(update, 0), true);
}

/** `Node.isConnected` (Chromium 54). */
function polyfillIsConnected(): void {
  if ("isConnected" in Node.prototype) return;
  Object.defineProperty(Node.prototype, "isConnected", {
    configurable: true,
    get(this: Node) {
      const doc = this.ownerDocument;
      return this.nodeType === 9 || (!!doc && doc.documentElement.contains(this));
    },
  });
}

/** The nearest ancestor that scrolls vertically (overflow other than visible, and taller content than its box). */
function scrollParent(el: Element): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.scrollHeight > p.clientHeight && getComputedStyle(p).overflowY !== "visible") return p;
  }
  return null;
}

/**
 * `scrollIntoView({ block })` (Chromium 61): an older engine reads the object as `true` (align to the top). The
 * options are honoured on the nearest scrolling box; `inline` and `behavior` are left to the engine.
 */
function polyfillScrollIntoViewOptions(doc: Document): void {
  if ("scrollBehavior" in doc.documentElement.style) return;
  const native = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
    if (arg === undefined || typeof arg === "boolean") return native.call(this, arg);
    const block = arg.block ?? "start";
    if (block === "start") return native.call(this, true);
    if (block === "end") return native.call(this, false);
    const box = scrollParent(this);
    if (!box) return native.call(this, true);
    const r = this.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    // The rects are scaled with the stage; scrollTop is not.
    const scale = box.offsetHeight > 0 ? b.height / box.offsetHeight || 1 : 1;
    if (block === "center") box.scrollTop += (r.top + r.height / 2 - (b.top + b.height / 2)) / scale;
    else if (r.top < b.top) box.scrollTop += (r.top - b.top) / scale;
    else if (r.bottom > b.bottom) box.scrollTop += (r.bottom - b.bottom) / scale;
  } as typeof Element.prototype.scrollIntoView;
}

let preventScroll: boolean | null = null;

/** Whether `focus({ preventScroll })` is honoured (Chromium 64): an older engine never reads the option. */
export function supportsPreventScroll(): boolean {
  if (preventScroll !== null) return preventScroll;
  preventScroll = false;
  try {
    const probe = document.createElement("div");
    probe.focus({ get preventScroll() { preventScroll = true; return true; } } as FocusOptions);
  } catch { /* stays false */ }
  return preventScroll;
}

/**
 * `el.focus({ preventScroll: true })` that also holds on an engine without the option: the scroll positions of the
 * ancestors are put back after the focus (the browser would scroll a list, or the stage, to the control).
 */
export function focusWithoutScroll(el: HTMLElement): void {
  if (supportsPreventScroll()) { el.focus({ preventScroll: true }); return; }
  const saved: Array<[Element, number, number]> = [];
  for (let p = el.parentElement; p; p = p.parentElement) saved.push([p, p.scrollTop, p.scrollLeft]);
  const x = window.pageXOffset;
  const y = window.pageYOffset;
  el.focus();
  for (const [p, top, left] of saved) {
    if (p.scrollTop !== top) p.scrollTop = top;
    if (p.scrollLeft !== left) p.scrollLeft = left;
  }
  if (window.pageXOffset !== x || window.pageYOffset !== y) window.scrollTo(x, y);
}

/**
 * Sets up what the engine lacks, before the first render: `html.no-flex-gap` for the stylesheet fallbacks and the
 * text-run marks they need, `:focus-within`, `isConnected` and `scrollIntoView` options. Returns what was missing.
 */
export function installLegacySupport(doc: Document = document): string[] {
  const missing: string[] = [];
  try {
    polyfillIsConnected();
    if (!supportsFlexGap(doc)) {
      missing.push("flex-gap");
      doc.documentElement.classList.add("no-flex-gap");
      watchTextNeighbours(doc.body || doc.documentElement);
    }
    if (!supportsSelector(doc, ":focus-within")) { missing.push("focus-within"); polyfillFocusWithin(doc); }
    if (!("scrollBehavior" in doc.documentElement.style)) { missing.push("scroll-into-view-options"); polyfillScrollIntoViewOptions(doc); }
    if (!supportsPreventScroll()) missing.push("prevent-scroll");
  } catch { /* a fallback must never stop the app from starting */ }
  return missing;
}
