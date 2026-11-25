import { useState } from "preact/hooks";
import { focusFirst, Presence } from "@skmate/ui";
import { t } from "../i18n";
import { TextEntry } from "./TextEntry";

/**
 * A value typed with the remote, as in the playlist form: a row that says what it is and what is filled in; OK opens
 * the entry panel (TextEntry), so the focus never lands in a bare text box that would pop the TV's keyboard. After
 * Done or Back the focus is on this row again (or wherever [onDone] sends it).
 */
export function EntryRow(p: {
  id: string;
  title: string;
  /** What is filled in; empty shows [placeholder] (or "Not set") in the quiet colour. */
  value: string;
  placeholder?: string;
  /** The entry panel's title and the line under it; the row's title when not given. */
  entryTitle?: string;
  entryHint?: string;
  secret?: boolean;
  /** The panel starts empty (an "add" row), not with [value]. */
  fresh?: boolean;
  onDone: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const back = () => setTimeout(() => focusFirst(document, p.id), 0);
  const shown = p.secret ? "•".repeat(Math.min(p.value.length, 12)) : p.value;
  return (
    <>
      <button class="srow src-field" data-focus={p.id} onClick={() => setOpen(true)}>
        <span class="srow-text">
          <span class="srow-title">{p.title}</span>
          <span class={p.value ? "src-value" : "srow-hint"}>{p.value ? shown : (p.placeholder ?? t("entEmpty"))}</span>
        </span>
      </button>
      <Presence show={open}>
        {(out) => (
          <TextEntry title={p.entryTitle ?? p.title} hint={p.entryHint ?? ""} value={p.fresh ? "" : p.value} closing={out}
            type={p.secret ? "password" : "text"}
            onDone={(v) => { setOpen(false); back(); p.onDone(v); }}
            onCancel={() => { setOpen(false); back(); }} />
        )}
      </Presence>
    </>
  );
}
