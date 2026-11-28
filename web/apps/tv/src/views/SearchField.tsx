import { useEffect, useRef, useState } from "preact/hooks";
import { focusFirst, Icon, Presence } from "@skmate/ui";
import { moveFrom, TextEntry } from "./TextEntry";

/**
 * `StageSearchField` in the TV-box look (ui/stage/StageControls.kt): a 48-high slab, radius 4, the magnifier and the
 * placeholder or what is typed; focused (or typing) = the light plate with dark text. OK opens the Android-style entry
 * popup (TextEntry) instead of a bare field, so the TV keyboard never pops up because the cursor passed by. What is
 * typed reaches [onChange] only when Done is pressed or the typing stops for [IDLE_MS]: on a TV a search over thousands of names takes
 * seconds, so searching on every pause froze the screen while the word was still being typed. Back in the popup keeps the text (Cancel puts the old one back).
 */
/** Without a key this long the typed text is searched by itself. */
export const IDLE_MS = 10_000;

export function SearchField(p: {
  id: string;
  value: string;
  placeholder: string;
  /** The entry popup's title and the line under it. */
  title: string;
  hint: string;
  onChange: (value: string) => void;
  /** Typing ended with Done (a search can remember the query). */
  onDone?: (value: string) => void;
  /** Under the field while typing ("Найдено: 12"). */
  note?: (value: string) => string;
  onKeyDown?: (e: KeyboardEvent) => void;
  className?: string;
  style?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  /** What the note under the field counts: the text as it stood when the typing paused. */
  const [settled, setSettled] = useState("");
  const before = useRef("");
  const typed = useRef("");
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => { setSettled(draft); p.onChange(draft); }, IDLE_MS);
    return () => clearTimeout(id);
  }, [open, draft]);
  const back = () => setTimeout(() => focusFirst(document, p.id), 0);
  const leave = (how: string) => { if (how === "up" || how === "down") moveFrom(p.id, how); };
  return (
    <>
      <button
        class={`st-focusable st-search ss-field${open ? " st-lit" : ""}${p.className ? ` ${p.className}` : ""}`} style={p.style}
        data-focus={p.id} aria-label={p.placeholder} onKeyDown={p.onKeyDown as never}
        onClick={() => { before.current = p.value; typed.current = p.value; setDraft(p.value); setSettled(p.value); setOpen(true); }}
      >
        <Icon name="search" size={20} />
        <span class={p.value ? "ss-q" : "ss-ph"}>{p.value || p.placeholder}</span>
      </button>
      <Presence show={open}>
        {(out) => (
          <TextEntry plain
            title={p.title} hint={p.hint} value={before.current} closing={out}
            onInput={(v) => { typed.current = v; setDraft(v); }}
            note={p.note ? p.note(settled) : undefined}
            leave onDone={(v, how = "ok") => { setOpen(false); p.onChange(v); p.onDone?.(v); back(); leave(how); }}
            onCancel={() => { setOpen(false); p.onChange(before.current); back(); }}
          />
        )}
      </Presence>
    </>
  );
}
