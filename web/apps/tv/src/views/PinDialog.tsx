import { useEffect, useState } from "preact/hooks";
import { validPin } from "@skmate/core";
import { focusFirst } from "@skmate/ui";
import { t } from "../i18n";

const MAX_DIGITS = 6;
const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "erase", "0", "ok"] as const;

/**
 * Numeric PIN entry, as on Android: the remote's digit keys type straight in, the arrows walk an on-screen pad.
 * [check] says whether the PIN is accepted (a wrong one shakes the dots and clears them); [extra] are more
 * buttons under the pad (another profile, cancel).
 */
export function PinDialog(props: {
  title: string;
  hint?: string;
  check: (pin: string) => boolean;
  onDone: (pin: string) => void;
  onCancel?: () => void;
  extra?: preact.ComponentChildren;
}) {
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  useEffect(() => { focusFirst(document, "pin-1"); }, []);

  const submit = (value: string) => {
    if (!validPin(value)) { setWrong(true); return; }
    if (props.check(value)) props.onDone(value);
    else { setWrong(true); setPin(""); }
  };
  const press = (k: (typeof PAD)[number]) => {
    if (k === "ok") { submit(pin); return; }
    setWrong(false);
    if (k === "erase") setPin((p) => p.slice(0, -1));
    else setPin((p) => (p.length < MAX_DIGITS ? p + k : p));
  };

  // The remote's digit keys (0–9 and the numeric pad) type, Back erases or leaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const digit = /^[0-9]$/.test(e.key) ? e.key : e.keyCode >= 96 && e.keyCode <= 105 ? String(e.keyCode - 96) : null;
      // Typed with the remote's digits, OK then confirms: the focus waits on "Done", not on a digit of the pad.
      if (digit !== null) { e.preventDefault(); e.stopPropagation(); press(digit as (typeof PAD)[number]); focusFirst(document, "pin-ok"); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [pin]);

  return (
    <div class="scrim" data-modal>
      <div class="dialog pin-dialog" role="dialog" aria-label={props.title}>
        <div class="dialog-title">{props.title}</div>
        <div class="dialog-body">{wrong ? t("pinWrong") : props.hint ?? t("pinDigits")}</div>
        <div class={`pin-dots${wrong ? " wrong" : ""}`} aria-label={t("pinEntered", { n: pin.length })}>
          {Array.from({ length: Math.max(4, pin.length) }, (_, i) => <span class={i < pin.length ? "on" : ""} key={i} />)}
        </div>
        <div class="pin-pad">
          {PAD.map((k) => (
            <button class={`btn pin-key${k === "ok" ? " ok" : ""}`} key={k} data-focus={`pin-${k}`} onClick={() => press(k)}>
              {k === "erase" ? t("pinErase") : k === "ok" ? t("pinOk") : k}
            </button>
          ))}
        </div>
        {props.extra || props.onCancel ? (
          <div class="dialog-actions">
            {props.extra}
            {props.onCancel ? <button class="btn" data-focus="pin-cancel" onClick={props.onCancel}>{t("confirmCancel")}</button> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
