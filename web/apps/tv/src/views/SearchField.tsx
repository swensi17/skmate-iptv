import { useRef, useState } from "preact/hooks";
import { focusFirst, Icon, Presence } from "@skmate/ui";
import { TextEntry } from "./TextEntry";

/**
 * `StageSearchField` in the TV-box look (ui/stage/StageControls.kt): a 48-high slab, radius 4, the magnifier and the
 * placeholder or what is typed; focused (or typing) = the light plate with dark text. OK opens the Android-style entry
 * popup (TextEntry) instead of a bare field, so the TV keyboard never pops up because the cursor passed by. What is
 * typed reaches [onChange] at once, as Android searches while you type; Back in the popup puts the old text back.
 */
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
  const before = useRef("");
  const back = () => setTimeout(() => focusFirst(document, p.id), 0);
  return (
    <>
      <button
        class={`st-focusable st-search ss-field${open ? " st-lit" : ""}${p.className ? ` ${p.className}` : ""}`} style={p.style}
        data-focus={p.id} aria-label={p.placeholder} onKeyDown={p.onKeyDown as never}
        onClick={() => { before.current = p.value; setDraft(p.value); setOpen(true); }}
      >
        <Icon name="search" size={20} />
        <span class={p.value ? "ss-q" : "ss-ph"}>{p.value || p.placeholder}</span>
      </button>
      <Presence show={open}>
        {(out) => (
          <TextEntry
            title={p.title} hint={p.hint} value={before.current} closing={out}
            onInput={(v) => { setDraft(v); p.onChange(v); }}
            note={p.note ? p.note(draft) : undefined}
            onDone={(v) => { setOpen(false); p.onChange(v); p.onDone?.(v); back(); }}
            onCancel={() => { setOpen(false); p.onChange(before.current); back(); }}
          />
        )}
      </Presence>
    </>
  );
}
