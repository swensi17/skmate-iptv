import { useState } from "preact/hooks";
import { Icon } from "@skmate/ui";
import { t } from "../i18n";
import type { ProfileBook } from "../state/scope";
import { SettingRow } from "./SettingRow";
import "./screens.css";

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

/**
 * The profiles, laid out as the playlists are: one row per profile (what it has on in grey under the name, delete beside
 * it); then the active one's own settings (kids, PIN) as ordinary setting rows; then the field to add one.
 */
export function ProfilesPanel({ book, onSwitch, onAdd, onAskDelete, onSetPin, onRemovePin, onToggleKids }: Props) {
  const [name, setName] = useState("");
  const add = () => { if (name.trim() !== "") { onAdd(name); setName(""); } };
  const me = book.profiles.find((p) => p.id === book.activeId);
  const nameOf = (p: { guest?: boolean; name: string }) => (p.guest ? t("guestName") : p.name);
  return (
    <div class="setting pf-panel">
      <div class="srow-hint pf-hint">{t("profileHint")}</div>
      <div class="pl-list">
        {book.profiles.map((p) => {
          const active = p.id === book.activeId;
          const marks = [p.kids ? t("profileKidsOn") : null, p.pinHash ? t("profileLocked") : null].filter(Boolean).join(" · ");
          return (
            <div class="pl-item" key={p.id}>
              <button class="srow pl-row" data-focus={`pf-${p.id}`} aria-pressed={active} onClick={() => !active && onSwitch(p.id)}>
                <span class="srow-text">
                  <span class="srow-title pf-name">{nameOf(p)}</span>
                  {marks ? <span class="srow-hint">{marks}</span> : null}
                </span>
                <span class="sub">{active ? t("profileActive") : t("profileSwitch")}</span>
              </button>
              {active ? null : (
                <button class="icon-btn" data-focus={`pf-del-${p.id}`} aria-label={t("playlistDelete")} title={t("playlistDelete")} onClick={() => onAskDelete(p.id)}>
                  <Icon name="trash" size={30} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {me ? (
        <>
          <div class="caption pf-caption">{nameOf(me)}</div>
          <SettingRow id="pf-kids" title="profileKids" hint="profileKidsHint" value={!!me.kids}
            options={[{ value: false, label: t("off") }, { value: true, label: t("on") }]}
            onPick={(on) => { if (on !== !!me.kids) onToggleKids(); }} />
          <button class="srow" data-focus="pf-pin" onClick={onSetPin}>
            <span class="srow-text"><span class="srow-title">{me.pinHash ? t("profilePinChange") : t("profilePinSet")}</span></span>
          </button>
          {me.pinHash ? (
            <button class="srow" data-focus="pf-pin-off" onClick={onRemovePin}>
              <span class="srow-text"><span class="srow-title">{t("profilePinRemove")}</span></span>
            </button>
          ) : null}
        </>
      ) : null}
      <div class="caption pf-caption">{t("profileAdd")}</div>
      <div class="add pf-add">
        <input class="field" data-focus="pf-name" value={name} placeholder={t("profileNamePlaceholder")}
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button class="btn" data-focus="pf-add" onClick={add}>{t("profileAdd")}</button>
      </div>
    </div>
  );
}
