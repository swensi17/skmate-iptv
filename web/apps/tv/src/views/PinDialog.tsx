import { useEffect, useRef, useState } from "preact/hooks";
import { focusFirst, Icon, Popup, PopupButton } from "@skmate/ui";
import { t } from "../i18n";
import { keepVisible } from "./keepVisible";

/** Android PinDialog: digits only, up to 6, OK from 4 (ProfileComponents.kt:60-100). */
export const PIN_MIN = 4;
export const PIN_MAX = 6;
/** What the PIN field accepts: the digits of [raw], at most [PIN_MAX]; null when something else was typed (Android drops that edit). */
export function pinInput(raw: string): string | null {
  if (raw.length > PIN_MAX || !/^[0-9]*$/.test(raw)) return null;
  return raw;
}

/**
 * PIN entry, as on Android (ProfileComponents.kt PinDialog): a popup (700 wide) with the title, one password field row
 * ("PIN", the placeholder "····", digits only, 6 at most) and Cancel / OK at the bottom right; OK is dimmed until 4 digits are in.
 * The field has the focus at once, so the TV's number keyboard opens on it (the remote's digits type straight in).
 * [check] says whether the PIN is accepted (a wrong one says so and clears the field); [extra] are more buttons (another profile).
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
  const [typing, setTyping] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  const submit = () => {
    if (pin.length < PIN_MIN) return;
    if (props.check(pin)) props.onDone(pin);
    else { setWrong(true); setPin(""); input.current?.focus(); }
  };
  // The lock screen has no Cancel: Back there is the app's own (it leaves).
  const dismiss = props.onCancel ?? (() => undefined);
  return (
    <Popup title={props.title} body={wrong ? t("pinWrong") : props.hint ?? undefined} width={700} onClose={dismiss}
      buttons={(
        <>
          {props.onCancel ? <PopupButton id="pin-cancel" primary={false} text={t("sa_common_cancel")} onClick={props.onCancel} /> : null}
          <PopupButton id="pin-ok" text={t("sa_common_ok")} disabled={pin.length < PIN_MIN} onClick={submit} />
        </>
      )}>
      <label class={`st-field entry-row${typing ? " st-focusable st-lit" : ""}`}>
        <span class="st-setting-icon"><Icon name="edit" size={32} /></span>
        <span class="st-setting-body">
          <span class="st-setting-title">{t("sa_profiles_pin")}</span>
          <input
            ref={input} class="st-field-input" data-focus="pin-field" value={pin} placeholder="····" type="password"
            inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" autocomplete="off" spellcheck={false} maxLength={PIN_MAX}
            onFocus={(e) => { setTyping(true); keepVisible(e); }} onBlur={() => setTyping(false)}
            onInput={(e) => {
              const el = e.currentTarget as HTMLInputElement;
              const next = pinInput(el.value);
              if (next === null) { el.value = pin; return; } // a letter or a seventh digit: the edit is dropped
              setWrong(false);
              setPin(next);
            }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.keyCode === 13) { e.preventDefault(); if (pin.length >= PIN_MIN) submit(); else focusFirst(document, "pin-ok"); } }}
          />
        </span>
      </label>
      {props.extra ? <div class="dialog-actions pin-extra">{props.extra}</div> : null}
    </Popup>
  );
}

