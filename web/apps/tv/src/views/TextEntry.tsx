import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { isBack, SheetWings, sheetTravel } from "@skmate/ui";
import { t } from "../i18n";

/**
 * Typing one value with a remote: a sheet rises from the bottom over the whole screen, with what to
 * type, an example, one big field (the TV's keyboard opens on it), Done and Cancel. OK in the field is Done, Back
 * is Cancel. The rest of the app does not see these keys while the panel is open, so Back never closes the
 * settings behind it.
 */
export function TextEntry(p: {
  title: string;
  hint: string;
  value: string;
  type?: "text" | "password";
  onDone: (value: string) => void;
  onCancel: () => void;
  /** Going down again (see `Presence`): it no longer takes keys. */
  closing?: boolean;
}) {
  const [value, setValue] = useState(p.value);
  const input = useRef<HTMLInputElement>(null);
  const done = () => p.onDone(value.trim());
  // The same rise as the settings sheets: the whole window, the bands beside the stage included (see Drawer).
  const [travel] = useState(sheetTravel);

  useEffect(() => {
    const el = input.current;
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, []);

  // Back and a right click belong to this panel while it is open: caught before the app's own handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (p.closing) return;
      const typing = document.activeElement instanceof HTMLInputElement;
      if (isBack(e) && !(typing && e.key === "Backspace")) { e.preventDefault(); e.stopImmediatePropagation(); p.onCancel(); }
    };
    const onContext = (e: MouseEvent) => { e.preventDefault(); e.stopImmediatePropagation(); p.onCancel(); };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("contextmenu", onContext, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("contextmenu", onContext, true);
    };
  }, [p.onCancel, p.closing]);

  return createPortal(
    <>
    <SheetWings closing={p.closing} />
    <div class={`entry-scrim${p.closing ? " closing" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) p.onCancel(); }}>
      <div class={`entry${travel ? " far" : ""}${p.closing ? " out" : ""}`} style={travel ? { "--travel": `${travel}px` } : undefined} role="dialog" aria-label={p.title} data-modal={p.closing ? undefined : ""}>
        <div class="entry-col">
        <div class="entry-title">{p.title}</div>
        <div class="entry-hint">{p.hint}</div>
        <input
          ref={input} class="entry-field" data-focus="entry-field" value={value} placeholder={t("entTypeHere")}
          type={p.type ?? "text"} autocomplete="off" spellcheck={false} autocapitalize="off"
          onInput={(e) => setValue((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); done(); } }}
        />
        <div class="entry-actions">
          <button class="btn primary" data-focus="entry-done" onClick={done}>{t("done")}</button>
          <button class="btn" data-focus="entry-cancel" onClick={p.onCancel}>{t("confirmCancel")}</button>
        </div>
        <div class="entry-keys">{t("entKeys")}</div>
        </div>
      </div>
    </div>
    </>,
    document.getElementById("app") ?? document.body, // inside the scaled stage, above the settings sheet
  );
}
