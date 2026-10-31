import type { ComponentChildren } from "preact";

/**
 * A panel that slides in from an edge over a dimmed screen, and slides out again when [closing] is set (see
 * `Presence`). It is a dialog for the remote: focus stays inside it (`data-modal`), Back or a click outside closes it.
 */
export function Drawer(p: { side: "left" | "right"; width: number; label: string; onClose: () => void; closing?: boolean; children: ComponentChildren }) {
  return (
    <div class={`scrim drawer-scrim${p.closing ? " closing" : ""}`} data-modal={p.closing ? undefined : ""} onClick={p.onClose}>
      <aside class={`drawer drawer-${p.side}${p.closing ? " out" : ""}`} style={{ width: `${p.width}px` }} role="dialog" aria-label={p.label} onClick={(e) => e.stopPropagation()}>
        {p.children}
      </aside>
    </div>
  );
}
