import type { ComponentChildren } from "preact";

/**
 * A panel that slides in from an edge over a dimmed screen, and slides out again when [closing] is set (see
 * `Presence`). By default it is a dialog for the remote: focus stays inside it (`data-modal`), Back or a click outside
 * closes it. With [modal] false the remote may leave it for what is outside (the player's bar below it), and
 * [bottomGap] keeps that much of the screen's bottom free.
 *
 * `side="bottom"` is a sheet: it rises from the bottom over the whole screen and goes down again the same way, its
 * content in one centred column (`.sheet-col`) so text has room. Sheets stack: a section opened from a sheet is
 * another sheet on top, and Back lowers only that one. Only a transform moves, so it is cheap on a TV.
 */
export function Drawer(p: {
  side: "left" | "right" | "bottom";
  width?: number;
  label: string;
  onClose: () => void;
  closing?: boolean;
  modal?: boolean;
  bottomGap?: number;
  /** An extra class for the panel itself. */
  className?: string;
  children: ComponentChildren;
}) {
  const modal = p.modal ?? true;
  const sheet = p.side === "bottom";
  const size = sheet ? {} : { width: `${p.width ?? 760}px`, ...(p.bottomGap ? { height: `calc(100% - ${p.bottomGap}px)` } : {}) };
  return (
    <div class={`scrim drawer-scrim${sheet ? " sheet-scrim" : ""}${p.closing ? " closing" : ""}${modal ? "" : " open-ended"}`} data-modal={modal && !p.closing ? "" : undefined} onClick={p.onClose}>
      <aside
        class={`drawer drawer-${p.side}${p.closing ? " out" : ""}${p.className ? ` ${p.className}` : ""}`}
        style={size} role="dialog" aria-label={p.label} onClick={(e) => e.stopPropagation()}
      >
        {sheet ? <div class="sheet-col">{p.children}</div> : p.children}
      </aside>
    </div>
  );
}
