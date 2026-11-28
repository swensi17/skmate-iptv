import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { logoGate } from "./logoGate";
import { createPager, getChNavConfig, pagingDirection } from "./chNav";
import { flingStep } from "./touch";
import { centerTop, clampIndex, revealTop, visibleWindow } from "./virtual";

export interface VirtualListProps<T> {
  items: readonly T[];
  rowHeight: number;
  height: number;
  /** Stable key and `data-focus` id of a row. */
  idOf: (item: T, index: number) => string;
  renderRow: (item: T, index: number) => ComponentChildren;
  /** Row to show first (and to focus when [autofocus] is set). */
  initialIndex?: number;
  autofocus?: boolean;
  /** Not used any more: CH+/CH- and rewind/forward page by Settings > Remote buttons (chNav.ts), as on Android. */
  pageSize?: number;
  /** false: the paging keys do nothing here (Android's player channel panel is not wired to them). Default true. */
  paging?: boolean;
  /** false: a held paging key pages like a short press instead of jumping to the first / last row (the "All" list). */
  endJump?: boolean;
  /** Rows of room kept ahead of the focused row while scrolling (Android's edgeScrollSpec keeps 1). Default 0. */
  room?: number;
}

/**
 * A list of thousands of rows drawn as a handful. The rows themselves slide (never one huge layer: a TV's GPU cannot hold a 260 000 px tall texture). Focus moves between the rendered rows by the global
 * D-pad handler; this component scrolls to keep the focused row in view and pages by [pageSize].
 */
export function VirtualList<T>(p: VirtualListProps<T>) {
  const [top, setTop] = useState(() => centerTop(p.initialIndex ?? 0, p.rowHeight, p.height, p.items.length));
  const [wanted, setWanted] = useState<number | null>(p.autofocus ? p.initialIndex ?? 0 : null);
  const box = useRef<HTMLDivElement>(null);
  /** The row a page jump is heading to: a second press before the first lands continues from there. */
  const heading = useRef<number | null>(null);
  const topRef = useRef(top);
  topRef.current = top;
  const win = visibleWindow(top, p.height, p.rowHeight, p.items.length);
  const pager = useRef(createPager());

  // A page jump asks for a row that may not be drawn yet: scroll first, focus once it exists.
  useEffect(() => {
    if (wanted === null) return;
    const item = p.items[wanted];
    if (item === undefined) { setWanted(null); return; }
    const el = box.current?.querySelector<HTMLElement>(`[data-index="${wanted}"]`);
    if (el) { el.querySelector<HTMLElement>("[data-focus]")?.focus(); setWanted(null); if (heading.current === wanted) heading.current = null; }
    else setTop((t) => revealTop(t, wanted, p.rowHeight, p.height, p.items.length, p.room));
  }, [wanted, win.first, win.last, p.items]);

  const onFocusIn = (e: FocusEvent) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-index]");
    if (!row) return;
    logoGate.busy();
    const index = Number(row.dataset.index);
    setTop((t) => revealTop(t, index, p.rowHeight, p.height, p.items.length, p.room));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    // CH+/CH- and rewind/fast-forward: swallowed here, the page happens when the key comes up (ChNavPaging.kt).
    if (step === 0) {
      if (p.paging !== false && pagingDirection(e) !== 0 && getChNavConfig().enabled && pager.current.down(e)) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    const current = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-index]");
    if (!current) return;
    const from = heading.current ?? Number(current.dataset.index);
    // Up and Down walk this list row by row, however fast they come: the row to land on may not be drawn yet, and the
    // geometry of the screen would then pick something beside the list. Only past the first or last row do they leave it.
    if (from + step < 0 || from + step > p.items.length - 1) return;
    e.preventDefault();
    e.stopPropagation();
    const to = clampIndex(from, step, p.items.length);
    heading.current = to;
    logoGate.busy();
    setWanted(to);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (p.paging === false || pagingDirection(e) === 0) return;
    const current = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-index]");
    const from = heading.current ?? (current ? Number(current.dataset.index) : -1);
    const r = pager.current.up(e, from, p.items.length - 1, p.endJump !== false);
    if (!r.handled) return;
    e.preventDefault();
    e.stopPropagation();
    if (r.to !== null && from >= 0) { heading.current = r.to; setWanted(r.to); }
  };

  // A wheel (or a touchpad) slides the list under the pointer; focus stays where it was until the pointer moves.
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    logoGate.busy();
    setTop((t) => Math.max(0, Math.min(t + e.deltaY, Math.max(0, p.items.length * p.rowHeight - p.height))));
  };


  // A finger drags the list and lets it glide on (touch-action: pan-x in ui.css leaves vertical moves to us). Only `top`
  // changes, so the rows just slide; the click that ends a drag is swallowed so a scroll does not open a channel.
  const drag = useRef({ on: false, moved: false, y: 0, startY: 0, t: 0, v: 0, frame: 0, quiet: 0 });
  const maxTop = () => Math.max(0, p.items.length * p.rowHeight - p.height);
  const stopFling = () => { if (drag.current.frame) { cancelAnimationFrame(drag.current.frame); drag.current.frame = 0; box.current?.classList.remove("drag"); } };
  const onTouchStart = (e: TouchEvent) => {
    stopFling();
    const d = drag.current, y = e.touches[0]?.clientY ?? 0;
    d.on = e.touches.length === 1; d.moved = false; d.y = y; d.startY = y; d.t = Date.now(); d.v = 0;
  };
  const onTouchMove = (e: TouchEvent) => {
    const d = drag.current;
    if (!d.on) return;
    const y = e.touches[0]?.clientY ?? d.y, now = Date.now();
    if (!d.moved) {
      if (Math.abs(y - d.startY) < 8) return;
      d.moved = true;
      box.current?.classList.add("drag");
    }
    logoGate.busy();
    const dt = Math.max(1, now - d.t);
    const dy = d.y - y; // positive: the finger goes up, the list moves up
    d.v = d.v * 0.6 + (dy / dt) * 0.4; // px/ms, smoothed
    d.y = y; d.t = now;
    const next = Math.max(0, Math.min(topRef.current + dy, maxTop()));
    topRef.current = next; setTop(next);
  };
  const onTouchEnd = () => {
    const d = drag.current;
    if (!d.on) return;
    d.on = false;
    if (!d.moved) return;
    d.quiet = Date.now() + 350;
    let last = Date.now();
    const glide = () => {
      const now = Date.now(), step = flingStep(d.v, now - last);
      last = now; d.v = step.v;
      const next = Math.max(0, Math.min(topRef.current + step.dist, maxTop()));
      logoGate.busy();
      const stuck = next === topRef.current;
      topRef.current = next; setTop(next);
      d.frame = Math.abs(d.v) > 0.02 && !stuck ? requestAnimationFrame(glide) : 0;
      if (!d.frame) box.current?.classList.remove("drag");
    };
    d.frame = requestAnimationFrame(glide);
  };
  const onClickCapture = (e: MouseEvent) => {
    if (Date.now() < drag.current.quiet) { e.preventDefault(); e.stopPropagation(); }
  };
  useEffect(() => stopFling, []);

  const rows: ComponentChildren[] = [];
  for (let i = win.first; i <= win.last; i++) {
    const item = p.items[i] as T;
    rows.push(
      <div class="vrow" key={p.idOf(item, i)} data-index={i} style={{ height: `${p.rowHeight}px`, transform: `translateY(${i * p.rowHeight - top}px)` }}>
        {p.renderRow(item, i)}
      </div>,
    );
  }

  return (
    <div class="vlist" ref={box} style={{ height: `${p.height}px` }} onFocusIn={onFocusIn} onKeyDown={onKeyDown} onKeyUp={onKeyUp} onWheel={onWheel}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} onClickCapture={onClickCapture}>
      <div class="vinner">{rows}</div>
    </div>
  );
}
