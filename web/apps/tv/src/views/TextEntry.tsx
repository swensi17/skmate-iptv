import { useEffect, useRef, useState } from "preact/hooks";
import { Button, Icon, isBack, Popup } from "@skmate/ui";
import { OverSheet } from "./SettingsKit";
import { t } from "../i18n";

/**
 * Typing one value with a remote, the way the Android app asks for text (components/TextInputDialog.kt): a popup
 * (`StagePopup`, 820 wide) with the title and what to type, one field row (`StageFieldRow`: the pencil, an optional
 * [label], the text) and Cancel / Done at the bottom right. The field is focused at once, so the TV's keyboard opens
 * on it; the popup sits 40 px from the top edge (Android moves it there while the keyboard is up), so what is being
 * typed stays above the keys. OK in the field is Done. Back ends the typing and keeps the text (Android: the field stops
 * being edited, StageControls.kt:153-160); "Cancel" is the button that puts the old text back. In a search field (a
 * [leave] handler is given) Up and Down also end the typing and move on (StageControls.kt:162-175). The rest of the app
 * does not see these keys while it is open, so Back never closes the settings behind it.
 */
export function TextEntry(p: {
  title: string;
  hint: string;
  value: string;
  /** The field's own name above the text (Android: "Name"); without it the field shows the text alone. */
  label?: string;
  type?: "text" | "password";
  /** [how]: "ok" the Done button / OK key; "back", "up" and "down" the keys that end typing and keep the text. */
  onDone: (value: string, how?: "ok" | "back" | "up" | "down") => void;
  onCancel: () => void;
  /** A search field: Up / Down end the typing (Done) and the focus goes on from the field in that direction. */
  leave?: boolean;
  /** Leaving (see `Presence`): it no longer takes keys. */
  closing?: boolean;
  /** Every change while typing (a search counts what it would find); [note] is shown under the field. */
  onInput?: (value: string) => void;
  note?: string;
}) {
  const [value, setValue] = useState(p.value);
  const [typing, setTyping] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const done = (how: "ok" | "back" | "up" | "down" = "ok") => p.onDone(value.trim(), how);
  const doneRef = useRef(done);
  doneRef.current = done;

  useEffect(() => {
    const el = input.current;
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, []);

  // Back and a right click belong to this popup while it is open: caught before the app's own handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (p.closing) return;
      const inField = document.activeElement instanceof HTMLInputElement;
      if (isBack(e) && !(inField && e.key === "Backspace")) { e.preventDefault(); e.stopImmediatePropagation(); doneRef.current("back"); }
    };
    const onContext = (e: MouseEvent) => { e.preventDefault(); e.stopImmediatePropagation(); p.onCancel(); };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("contextmenu", onContext, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("contextmenu", onContext, true);
    };
  }, [p.closing]);

  return (
    <OverSheet app>
      <Popup top width={820} title={p.title} body={p.hint || undefined} onClose={p.onCancel} closing={p.closing}
        buttons={(
          <>
            <Button small id="entry-cancel" text={t("confirmCancel")} onClick={p.onCancel} />
            <Button small id="entry-done" text={t("done")} onClick={done} />
          </>
        )}>
        {/* The row is drawn focused while its field holds the focus (Android: highlighted while editing). */}
        <label class={`st-field entry-row${typing ? " st-focusable st-lit" : ""}`}>
          <span class="st-setting-icon"><Icon name="edit" size={32} /></span>
          <span class="st-setting-body">
            {p.label ? <span class="st-setting-title">{p.label}</span> : null}
            <input
              ref={input} class={`st-field-input${p.label ? "" : " solo"}`} data-focus="entry-field" value={value} placeholder={t("entTypeHere")}
              type={p.type ?? "text"} autocomplete="off" spellcheck={false} autocapitalize="off"
              onFocus={() => setTyping(true)} onBlur={() => setTyping(false)}
              onInput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; setValue(v); p.onInput?.(v); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.keyCode === 13) { e.preventDefault(); done(); return; }
                if (p.leave && (e.key === "ArrowUp" || e.keyCode === 38 || e.key === "ArrowDown" || e.keyCode === 40)) {
                  e.preventDefault(); e.stopPropagation();
                  done(e.key === "ArrowUp" || e.keyCode === 38 ? "up" : "down");
                }
              }}
            />
          </span>
        </label>
        {p.note !== undefined ? <div class="entry-note" role="status">{p.note}</div> : null}
      </Popup>
    </OverSheet>
  );
}

/**
 * After a search popup closed on Up or Down: the box has the focus again; the arrow is pressed on it, so the screen's own
 * handlers send it on (Android: focusManager.moveFocus). Waits for the popup to be gone.
 */
export function moveFrom(id: string, dir: "up" | "down"): void {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-focus="${id}"]`);
    if (!el) return;
    el.focus();
    const key = dir === "up" ? "ArrowUp" : "ArrowDown";
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  }, 40);
}
