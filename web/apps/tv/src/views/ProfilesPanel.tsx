import { useState } from "preact/hooks";
import { t } from "../i18n";
import type { ProfileBook } from "../state/scope";

interface Props {
  book: ProfileBook;
  onSwitch: (id: string) => void;
  onAdd: (name: string) => void;
  onAskDelete: (id: string) => void;
  /** The active profile only (it is the unlocked one): set or change its PIN, or remove it. */
  onSetPin: () => void;
  onRemovePin: () => void;
  onToggleKids: () => void;
}

/** The profiles; the active one has its lock and the kids setting, as in the Android app's profile editor. */
export function ProfilesPanel({ book, onSwitch, onAdd, onAskDelete, onSetPin, onRemovePin, onToggleKids }: Props) {
  const [name, setName] = useState("");
  const add = () => { if (name.trim() !== "") { onAdd(name); setName(""); } };
  const me = book.profiles.find((p) => p.id === book.activeId);
  return (
    <div class="setting">
      <div class="srow-hint" style={{ margin: "0 12px 16px" }}>{t("profileHint")}</div>
      {book.profiles.map((p) => {
        const active = p.id === book.activeId;
        const marks = [p.kids ? t("profileKidsOn") : null, p.pinHash ? t("profileLocked") : null].filter(Boolean).join(" · ");
        return (
          <div class="playlist" key={p.id}>
            <button class="row" data-focus={`pf-${p.id}`} aria-pressed={active} onClick={() => !active && onSwitch(p.id)}>
              <span class="grow">{p.guest ? t("guestName") : p.name}</span>
              {marks ? <span class="tag">{marks}</span> : null}
              <span class="sub">{active ? t("profileActive") : t("profileSwitch")}</span>
            </button>
            {active ? null : <button class="btn" data-focus={`pf-del-${p.id}`} onClick={() => onAskDelete(p.id)}>{t("playlistDelete")}</button>}
          </div>
        );
      })}
      {me ? (
        <>
          <button class="row" data-focus="pf-kids" aria-pressed={!!me.kids} onClick={onToggleKids}>
            <span class="grow two"><span class="nm">{t("profileKids")}</span><span class="prog">{t("profileKidsHint")}</span></span>
            <span class={`tag${me.kids ? " live" : ""}`}>{me.kids ? t("on") : t("off")}</span>
          </button>
          <div class="playlist">
            <button class="row" data-focus="pf-pin" onClick={onSetPin}>
              <span class="grow">{me.pinHash ? t("profilePinChange") : t("profilePinSet")}</span>
            </button>
            {me.pinHash ? <button class="btn" data-focus="pf-pin-off" onClick={onRemovePin}>{t("profilePinRemove")}</button> : null}
          </div>
        </>
      ) : null}
      <div class="add">
        <input class="field" data-focus="pf-name" value={name} placeholder={t("profileNamePlaceholder")}
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button class="btn" data-focus="pf-add" onClick={add}>{t("profileAdd")}</button>
      </div>
    </div>
  );
}
