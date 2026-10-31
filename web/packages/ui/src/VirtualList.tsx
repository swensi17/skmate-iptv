import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { clampIndex, revealTop, visibleWindow } from "./virtual";

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
  /** How many rows PageUp / PageDown / channel +/- jump. */
  pageSize?: number;
}

const PAGE_UP = [33, 427]; // PageUp, webOS channel up
const PAGE_DOWN = [34, 428];

/**
 * A list of thousands of rows drawn as a handful. The rows themselves slide (never one huge layer: a TV's GPU cannot hold a 260 000 px tall texture). Focus moves between the rendered rows by the global
 * D-pad handler; this component scrolls to keep the focused row in view and pages by [pageSize].
 */
export function VirtualList<T>(p: VirtualListProps<T>) {
  const [top, setTop] = useState(() => revealTop(0, p.initialIndex ?? 0, p.rowHeight, p.height, p.items.length));
  const [wanted, setWanted] = useState<number | null>(p.autofocus ? p.initialIndex ?? 0 : null);
  const box = useRef<HTMLDivElement>(null);
  /** The row a page jump is heading to: a second press before the first lands continues from there. */
  const heading = useRef<number | null>(null);
  const win = visibleWindow(top, p.height, p.rowHeight, p.items.length);

  // A page jump asks for a row that may not be drawn yet: scroll first, focus once it exists.
  useEffect(() => {
    if (wanted === null) return;
    const item = p.items[wanted];
    if (item === undefined) { setWanted(null); return; }
    const el = box.current?.querySelector<HTMLElement>(`[data-index="${wanted}"]`);
    if (el) { el.querySelector<HTMLElement>("[data-focus]")?.focus(); setWanted(null); if (heading.current === wanted) heading.current = null; }
    else setTop((t) => revealTop(t, wanted, p.rowHeight, p.height, p.items.length));
  }, [wanted, win.first, win.last, p.items]);

  const onFocusIn = (e: FocusEvent) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-index]");
    if (!row) return;
    const index = Number(row.dataset.index);
    setTop((t) => revealTop(t, index, p.rowHeight, p.height, p.items.length));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const dir = PAGE_UP.includes(e.keyCode) ? -1 : PAGE_DOWN.includes(e.keyCode) ? 1 : 0;
    if (dir === 0) return;
    const current = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-index]");
    if (!current) return;
    e.preventDefault();
    const from = heading.current ?? Number(current.dataset.index);
    const to = clampIndex(from, dir * (p.pageSize ?? 10), p.items.length);
    heading.current = to;
    setWanted(to);
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
    <div class="vlist" ref={box} style={{ height: `${p.height}px` }} onFocusIn={onFocusIn} onKeyDown={onKeyDown} onWheel={onWheel}>
      <div class="vinner">{rows}</div>
    </div>
  );
}
