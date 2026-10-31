import { useState } from "preact/hooks";
import { t } from "../i18n";
import type { ProfileBook } from "../state/scope";

interface Props {
  book: ProfileBook;
  onSwitch: (id: string) => void;
  onAdd: (name: string) => void;
  onAskDelete: (id: string) => void;
}

export function ProfilesPanel({ book, onSwitch, onAdd, onAskDelete }: Props) {
  const [name, setName] = useState("");
  const add = () => { if (name.trim() !== "") { onAdd(name); setName(""); } };
  return (
    <div class="setting">
      <div class="srow-hint" style={{ margin: "0 12px 16px" }}>{t("profileHint")}</div>
      {book.profiles.map((p) => {
        const active = p.id === book.activeId;
        return (
          <div class="playlist" key={p.id}>
            <button class="row" data-focus={`pf-${p.id}`} aria-pressed={active} onClick={() => !active && onSwitch(p.id)}>
              <span class="grow">{p.guest ? t("guestName") : p.name}</span>
              <span class="sub">{active ? t("profileActive") : t("profileSwitch")}</span>
            </button>
            {active ? null : <button class="btn" data-focus={`pf-del-${p.id}`} onClick={() => onAskDelete(p.id)}>{t("playlistDelete")}</button>}
          </div>
        );
      })}
      <div class="add">
        <input class="field" data-focus="pf-name" value={name} placeholder={t("profileNamePlaceholder")}
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button class="btn" data-focus="pf-add" onClick={add}>{t("profileAdd")}</button>
      </div>
    </div>
  );
}
