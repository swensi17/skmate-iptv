import { isCompact } from "@skmate/ui";

/**
 * A text field the finger just tapped: on a tablet or phone the soft keyboard then shrinks the window, and the field
 * (or the button under it) may end up behind the keys. Scroll it into the middle of what is left, again once the
 * window has settled. Does nothing on a TV, where the entry popup and the TV's keyboard do this.
 */
export function keepVisible(e: Event): void {
  if (!isCompact()) return;
  const el = e.currentTarget as HTMLElement | null;
  if (!el) return;
  const run = () => { if (el.isConnected && document.activeElement === el) el.scrollIntoView({ block: "center" }); };
  setTimeout(run, 60);
  setTimeout(run, 320);
  setTimeout(run, 700);
}
