import type { ComponentChildren } from "preact";

/**
 * A panel that slides in from an edge over a dimmed screen, as the settings sheet does on the phone.
 * It is a dialog for the remote: focus stays inside it (`data-modal`), Back or a click outside closes it.
 */
export function Drawer(p: { side: "left" | "right"; width: number; label: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div class="scrim drawer-scrim" data-modal onClick={p.onClose}>
      <aside class={`drawer drawer-${p.side}`} style={{ width: `${p.width}px` }} role="dialog" aria-label={p.label} onClick={(e) => e.stopPropagation()}>
        {p.children}
      </aside>
    </div>
  );
}
