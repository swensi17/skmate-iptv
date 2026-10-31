import type { ComponentChildren } from "preact";

/**
 * A panel that slides in from an edge over a dimmed screen, and slides out again when [closing] is set (see
 * `Presence`). By default it is a dialog for the remote: focus stays inside it (`data-modal`), Back or a click outside
 * closes it. With [modal] false the remote may leave it for what is outside (the player's bar below it), and
 * [bottomGap] keeps that much of the screen's bottom free.
 */
export function Drawer(p: {
  side: "left" | "right";
  width: number;
  label: string;
  onClose: () => void;
  closing?: boolean;
  modal?: boolean;
  bottomGap?: number;
  children: ComponentChildren;
}) {
  const modal = p.modal ?? true;
  return (
    <div class={`scrim drawer-scrim${p.closing ? " closing" : ""}${modal ? "" : " open-ended"}`} data-modal={modal && !p.closing ? "" : undefined} onClick={p.onClose}>
      <aside
        class={`drawer drawer-${p.side}${p.closing ? " out" : ""}`}
        style={{ width: `${p.width}px`, ...(p.bottomGap ? { height: `calc(100% - ${p.bottomGap}px)` } : {}) }}
        role="dialog" aria-label={p.label} onClick={(e) => e.stopPropagation()}
      >
        {p.children}
      </aside>
    </div>
  );
}
