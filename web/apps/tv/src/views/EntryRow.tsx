import { useEffect, useState } from "preact/hooks";
import { focusFirst, Icon, Presence } from "@skmate/ui";
import { t } from "../i18n";
import { TextEntry } from "./TextEntry";
import "./screens.css";

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

/** A TV is slow: the live count waits for a short pause in typing instead of searching on every key. */
const COUNT_PAUSE_MS = 250;

/**
 * The search of a screen, the same everywhere (channels, sport, films, the Search screen): a box at the left of the
 * toolbar with a magnifier and "Search", or what is searched now. OK opens the entry panel (the TV's keyboard never
 * pops up just because the cursor passed by); while typing, the panel says how many would be found ([count]); Done
 * shows the results and puts the cursor on the first one ([results], a selector), Up goes back to the box. An empty
 * Done or "Clear" beside the box shows everything again. [wide] is the large box at the top of the Search screen.
 */
export function SearchEntry(p: {
  id: string;
  value: string;
  /** The entry panel's title and the line under it: where is searched and how. */
  entryTitle: string;
  entryHint: string;
  /** In the box while nothing is searched; "Search" when not given. */
  placeholder?: string;
  wide?: boolean;
  /** How many a query would find, for the line under the field while typing. */
  count?: (query: string) => number;
  /** Where the results are: the first focusable one there gets the cursor after Done. */
  results?: string;
  onDone: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | undefined>(undefined);
  const back = (id: string) => setTimeout(() => focusFirst(document, id), 0);
  useEffect(() => {
    if (!open || !p.count) { setNote(undefined); return; }
    const q = draft.trim();
    if (q === "") { setNote(""); return; }
    const id = setTimeout(() => setNote(t("searchFound", { n: p.count?.(q) ?? 0 })), COUNT_PAUSE_MS);
    return () => clearTimeout(id);
  }, [open, draft]);
  const begin = () => { setDraft(p.value); setOpen(true); };
  const done = (v: string) => {
    setOpen(false);
    p.onDone(v);
    // Once the results are drawn: the first of them, or the box again when nothing was found.
    setTimeout(() => {
      const first = v.trim() !== "" && p.results ? document.querySelector<HTMLElement>(`${p.results} [data-focus]`) : null;
      if (first) first.focus(); else focusFirst(document, p.id);
    }, 0);
  };
  return (
    <div class={`search-entry${p.wide ? " wide" : ""}`}>
      <button class="search-box" data-focus={p.id} aria-label={t("filterSearch")} onClick={begin}>
        <Icon name="search" size={p.wide ? 32 : 28} />
        <span class={p.value ? "search-q" : "search-ph"}>{p.value || (p.placeholder ?? t("filterSearch"))}</span>
      </button>
      {p.value ? (
        <button class="btn tool search-reset" data-focus={`${p.id}-reset`} onClick={() => { p.onDone(""); back(p.id); }}>{t("searchReset")}</button>
      ) : null}
      <Presence show={open}>
        {(out) => (
          <TextEntry title={p.entryTitle} hint={p.entryHint} value={p.value} closing={out}
            onInput={p.count ? setDraft : undefined} note={p.count ? note ?? "" : undefined}
            onDone={done}
            onCancel={() => { setOpen(false); back(p.id); }} />
        )}
      </Presence>
    </div>
  );
}
