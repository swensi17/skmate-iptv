import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { createPager, getChNavConfig, pagingDirection } from "./chNav";
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
    setTop((t) => Math.max(0, Math.min(t + e.deltaY, Math.max(0, p.items.length * p.rowHeight - p.height))));
  };

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
    <div class="vlist" ref={box} style={{ height: `${p.height}px` }} onFocusIn={onFocusIn} onKeyDown={onKeyDown} onKeyUp={onKeyUp} onWheel={onWheel}>
      <div class="vinner">{rows}</div>
    </div>
  );
}
