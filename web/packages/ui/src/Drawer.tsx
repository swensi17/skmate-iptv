import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useState } from "preact/hooks";
import { useReturnFocus } from "./returnFocus";

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
/**
 * Where the full-window layers of sheets go: a fixed box right before the stage (#app) in the page, so it paints over
 * the page background but under the stage. (A negative z-index would put it under the body background.)
 */
function wingsHost(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let host = document.getElementById("sheet-wings-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "sheet-wings-host";
    const stage = document.getElementById("app");
    document.body.insertBefore(host, stage ?? document.body.firstChild);
  }
  return host;
}

/**
 * How far a sheet travels, in stage pixels: the window's whole height. The stage is scaled and centred, so when the
 * window is not 16:9 (or the interface is zoomed out) there are bands around it; travelling the window's height, the
 * sheet and its full-window layer (`SheetWings`, which travels 100% of the window) move as one rigid piece. Null when
 * there are no bands (a TV at 100 %): the plain 100% keyframes are exact there and need no variable.
 */
export function sheetTravel(): number | null {
  if (typeof document === "undefined") return null;
  const stage = document.getElementById("app");
  const h = stage ? stage.getBoundingClientRect().height : 0;
  if (!h) return null;
  const travel = (window.innerHeight * 1080) / h;
  return travel > 1081 ? Math.ceil(travel) : null;
}

/** The full-window layer behind the stage that covers the bands beside it while a sheet is up (see `Drawer`). */
export function SheetWings(p: { closing?: boolean }) {
  const host = wingsHost();
  return host ? createPortal(<div class={`sheet-wings${p.closing ? " out" : ""}`} aria-hidden="true" />, host) : null;
}

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
  /** On closing, the focus goes back to the control that opened the panel (see `useReturnFocus`). */
  returnFocus?: boolean;
  children: ComponentChildren;
}) {
  const modal = p.modal ?? true;
  const root = useReturnFocus<HTMLElement>(!!p.closing, !!p.returnFocus);
  const sheet = p.side === "bottom";
  // Measured once, as it opens: the window does not change size while a sheet moves.
  const [travel] = useState(() => (sheet ? sheetTravel() : null));
  // `.has-<class>` on the scrim stands in for `.drawer-scrim:has(.<class>)`, which TV engines before Chromium 105 drop.
  const has = p.className ? p.className.split(" ").filter(Boolean).map((c) => ` has-${c}`).join("") : "";
  const size = sheet ? (travel ? { "--travel": `${travel}px` } : {}) : { width: `${p.width ?? 760}px`, ...(p.bottomGap ? { height: `calc(100% - ${p.bottomGap}px)` } : {}) };
  // The stage keeps 16:9, so a wider or taller window shows bands beside it. A sheet also covers those: a layer of the
  // same colour on the whole window rises and falls with it (behind the stage, so only the bands show it).
  return (
    <>
    {sheet ? <SheetWings closing={p.closing} /> : null}
    <div class={`scrim drawer-scrim${sheet ? " sheet-scrim" : ""}${p.closing ? " closing" : ""}${modal ? "" : " open-ended"}${has}`} data-modal={modal && !p.closing ? "" : undefined} onClick={p.onClose}>
      <aside
        ref={root}
        class={`drawer drawer-${p.side}${travel ? " far" : ""}${p.closing ? " out" : ""}${p.className ? ` ${p.className}` : ""}`}
        style={size} role="dialog" aria-label={p.label} onClick={(e) => e.stopPropagation()}
      >
        {sheet ? <div class="sheet-col">{p.children}</div> : p.children}
      </aside>
    </div>
    </>
  );
}
