import type { ComponentChildren } from "preact";
import { useReturnFocus } from "./returnFocus";

/**
 * A panel at the edge of the screen. By default it is a dialog for the remote: focus stays inside it (`data-modal`),
 * Back or a click outside closes it ([onClose]). It leaves when [closing] is set (see `Presence`).
 *
 * [variant] picks one of the Android app's two side panels (ui.css documents the classes):
 * - `"sheet"`: the Settings sheet (SettingsStage.kt `SettingsSheet`): flush with the right edge, 37% of the screen
 *   (`wide`: 64%), full height, left corners rounded, no wash over the screen beside it. It slides in from the right
 *   with a fade (300 ms) when Settings opens; pages inside it change at once ([instant]), as on Android.
 * - `"panel"`: `StageSidePanel`, for short single-choice lists: 620 wide (or [width]), over a dimmed screen, 240 ms.
 * Both take a [title] for the header (and [subtitle] for a panel); without one the children draw their own.
 *
 * Without [variant] it is the older edge drawer still used by the player's lists (`side` left or right, [width],
 * [modal] false lets the remote leave it, [bottomGap] keeps the bottom free).
 */
export function Drawer(p: {
  side?: "left" | "right";
  variant?: "sheet" | "panel";
  /** Sheet: the wide layout (64% of the screen) for pages built for a wide screen. */
  wide?: boolean;
  /** Sheet: no slide and no fade, in or out (a page replacing another one inside Settings). */
  instant?: boolean;
  title?: string;
  subtitle?: string;
  /** Header tools beside a sheet's title. */
  tools?: ComponentChildren;
  width?: number;
  label: string;
  onClose: () => void;
  closing?: boolean;
  modal?: boolean;
  bottomGap?: number;
  /** An extra class for the panel itself. */
  className?: string;
  /** On closing, the focus goes back to the control that opened the panel (see `useReturnFocus`). */
  returnFocus?: boolean;
  children: ComponentChildren;
}) {
  const modal = p.modal ?? true;
  const root = useReturnFocus<HTMLElement>(!!p.closing, !!p.returnFocus);
  const extra = p.className ? ` ${p.className}` : "";
  const dialog = modal && !p.closing ? "" : undefined;

  if (p.variant === "sheet") {
    return (
      <div class={`st-layer st-sheet-layer${p.closing ? " closing" : ""}`} data-modal={dialog} onClick={p.onClose}>
        <aside
          ref={root} role="dialog" aria-label={p.label} onClick={(e) => e.stopPropagation()}
          class={`st-sheet${p.wide ? " wide" : ""}${p.instant ? " instant" : ""}${p.closing ? " out" : ""}${extra}`}
        >
          {p.title !== undefined ? <PanelHeader title={p.title} tools={p.tools} /> : null}
          {p.children}
        </aside>
      </div>
    );
  }

  if (p.variant === "panel") {
    return (
      <div class={`st-layer st-panel-layer${p.closing ? " closing" : ""}`} data-modal={dialog} onClick={p.onClose}>
        <aside
          ref={root} role="dialog" aria-label={p.label} onClick={(e) => e.stopPropagation()}
          class={`st-side-panel${p.closing ? " out" : ""}${extra}`} style={p.width ? { width: `${p.width}px` } : undefined}
        >
          {p.title !== undefined ? <SidePanelHeader title={p.title} subtitle={p.subtitle} /> : null}
          {p.children}
        </aside>
      </div>
    );
  }

  const side = p.side ?? "right";
  // `.has-<class>` on the scrim stands in for `.drawer-scrim:has(.<class>)`, which TV engines before Chromium 105 drop.
  const has = p.className ? p.className.split(" ").filter(Boolean).map((c) => ` has-${c}`).join("") : "";
  const size = { width: `${p.width ?? 760}px`, ...(p.bottomGap ? { height: `calc(100% - ${p.bottomGap}px)` } : {}) };
  return (
    <div class={`scrim drawer-scrim${p.closing ? " closing" : ""}${modal ? "" : " open-ended"}${has}`} data-modal={dialog} onClick={p.onClose}>
      <aside
        ref={root}
        class={`drawer drawer-${side}${p.closing ? " out" : ""}${extra}`}
        style={size} role="dialog" aria-label={p.label} onClick={(e) => e.stopPropagation()}
      >
        {p.children}
      </aside>
    </div>
  );
}

/** The Settings sheet's title row (32/800 at 30 from the edge, 36 from the top), with optional tools beside it. */
export function PanelHeader(p: { title: string; tools?: ComponentChildren }) {
  return (
    <div class="st-sheet-head">
      <div class="st-sheet-title">{p.title}</div>
      {p.tools ? <div class="st-sheet-tools">{p.tools}</div> : null}
    </div>
  );
}

/** A side panel's title (34/800) and the muted line under it. */
export function SidePanelHeader(p: { title: string; subtitle?: string }) {
  return (
    <div class="st-panel-head">
      <div class={`st-panel-title${p.subtitle ? " with-sub" : ""}`}>{p.title}</div>
      {p.subtitle ? <div class="st-panel-sub">{p.subtitle}</div> : null}
    </div>
  );
}
