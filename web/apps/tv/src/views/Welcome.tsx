import { useEffect, useState } from "preact/hooks";
import { focusFirst } from "@skmate/ui";
import { t } from "../i18n";

/** The first thing a new viewer sees: a greeting, and either a name or a way in as a guest. */
export function Welcome({ onName, onGuest }: { onName: (name: string) => void; onGuest: () => void }) {
  const [name, setName] = useState("");
  useEffect(() => { focusFirst(document, "welcome-name"); }, []);
  const submit = () => { if (name.trim() !== "") onName(name.trim()); };
  return (
    <div class="scrim" data-modal>
      <div class="dialog welcome" role="dialog" aria-label={t("welcomeTitle")}>
        <div class="dialog-title">{t("welcomeTitle")}</div>
        <div class="dialog-body">{t("welcomeBody")}</div>
        <input
          class="field" data-focus="welcome-name" value={name} placeholder={t("welcomeName")}
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <div class="dialog-actions" style={{ marginTop: 28 }}>
          <button class="btn" data-focus="welcome-guest" onClick={onGuest}>{t("welcomeGuest")}</button>
          <button class="btn" data-focus="welcome-continue" onClick={submit}>{t("welcomeContinue")}</button>
        </div>
      </div>
    </div>
  );
}
