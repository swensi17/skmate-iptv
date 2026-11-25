import { Icon } from "@skmate/ui";
import { t } from "../i18n";
import type { ProfileBook } from "../state/scope";
import { EntryRow } from "./EntryRow";
import { SettingRow } from "./SettingRow";
import "./screens.css";

interface Props {
  book: ProfileBook;
  onSwitch: (id: string) => void;
  onAdd: (name: string) => void;
  onRename: (name: string) => void;
  onAskDelete: (id: string) => void;
  /** The active profile only (it is the unlocked one): set or change its PIN, or remove it. */
  onSetPin: () => void;
  onRemovePin: () => void;
  onToggleKids: () => void;
}

/**
 * The profiles, in the order a viewer thinks of them: first the one in use now with what can be changed about it
 * (name, kids, PIN; nothing here leaves the settings), then the other profiles, each clearly "Sign in" (that one
 * restarts the app in that profile), then adding one. Every value is typed in the entry panel, never in a bare field.
 */
export function ProfilesPanel({ book, onSwitch, onAdd, onRename, onAskDelete, onSetPin, onRemovePin, onToggleKids }: Props) {
  const me = book.profiles.find((p) => p.id === book.activeId);
  const others = book.profiles.filter((p) => p.id !== book.activeId);
  const nameOf = (p: { guest?: boolean; name: string }) => (p.guest ? t("guestName") : p.name);
  return (
    <div class="setting pf-panel">
      {me ? (
        <>
          <div class="caption pf-caption pf-first">{t("profileActive")}</div>
          {me.guest ? (
            <div class="srow pf-static">
              <span class="srow-text"><span class="srow-title pf-name">{t("guestName")}</span><span class="srow-hint">{t("greetingGuest")}</span></span>
            </div>
          ) : (
            <EntryRow id={`pf-${me.id}`} title={t("profileNamePlaceholder")} value={me.name} onDone={onRename} />
          )}
          <SettingRow id="pf-kids" title="profileKids" hint="profileKidsHint" value={!!me.kids}
            options={[{ value: false, label: t("off") }, { value: true, label: t("on") }]}
            onPick={(on) => { if (on !== !!me.kids) onToggleKids(); }} />
          <button class="srow" data-focus="pf-pin" onClick={onSetPin}>
            <span class="srow-text"><span class="srow-title">{me.pinHash ? t("profilePinChange") : t("profilePinSet")}</span><span class="srow-hint">{t("pinDigits")}</span></span>
          </button>
          {me.pinHash ? (
            <button class="srow" data-focus="pf-pin-off" onClick={onRemovePin}>
              <span class="srow-text"><span class="srow-title">{t("profilePinRemove")}</span></span>
            </button>
          ) : null}
        </>
      ) : null}
      {others.length > 0 ? (
        <>
          <div class="caption pf-caption">{t("profileOthers")}</div>
          <div class="pl-list">
            {others.map((p) => {
              const marks = [p.kids ? t("profileKidsOn") : null, p.pinHash ? t("profileLocked") : null].filter(Boolean).join(" · ");
              return (
                <div class="pl-item" key={p.id}>
                  <button class="srow pl-row" data-focus={`pf-${p.id}`} onClick={() => onSwitch(p.id)}>
                    <span class="srow-text">
                      <span class="srow-title pf-name">{nameOf(p)}</span>
                      {marks ? <span class="srow-hint">{marks}</span> : null}
                    </span>
                    <span class="sub">{t("profileSwitch")}</span>
                  </button>
                  <button class="icon-btn" data-focus={`pf-del-${p.id}`} aria-label={t("playlistDelete")} title={t("playlistDelete")} onClick={() => onAskDelete(p.id)}>
                    <Icon name="trash" size={30} />
                  </button>
                </div>
              );
            })}
          </div>
          <div class="srow-hint pf-hint">{t("profileHint")}</div>
        </>
      ) : null}
      <div class="caption pf-caption">{t("profileAdd")}</div>
      <EntryRow id="pf-add" title={t("profileAdd")} value="" placeholder={t("profileNamePlaceholder")} entryTitle={t("profileNamePlaceholder")}
        entryHint={t("profileHint")} fresh onDone={(name) => { if (name.trim() !== "") onAdd(name); }} />
    </div>
  );
}
