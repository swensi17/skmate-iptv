import { useEffect, useRef, useState } from "preact/hooks";
import { Button, focusFirst, Popup, Presence, Toggle, useOwnBack } from "@skmate/ui";
import { t } from "../i18n";
import type { ProfileBook } from "../state/scope";
import { SIcon, SRow, Tag, useSheet, OverSheet } from "./SettingsKit";
import { TextEntry } from "./TextEntry";

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

type Profile = ProfileBook["profiles"][number];
const nameOf = (p: Profile) => (p.guest ? t("guestName") : p.name);

/**
 * Мой профиль (ProfileSettingsRows.kt): one row per profile — the name, "Используется · Детский режим · Без
 * блокировки" under it, the tags on the right (ИСПОЛЬЗУЕТСЯ outlined in blue, ДЕТСКИЙ, PIN) and › on the ones not in
 * use — then "Добавить профиль". OK on the profile in use edits it; hold OK (with more than one) deletes. The web app
 * changes only the profile in use, so OK on another one switches to it (Android edits it in place).
 */
export function ProfilesPanel(p: Props) {
  const sheet = useSheet();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const sep = t("sa_content_epg_bits_separator");
  return (
    <>
      {p.book.profiles.map((x) => {
        const inUse = x.id === p.book.activeId;
        const line = [
          inUse ? t("sa_settings_profile_in_use") : null,
          x.kids ? t("sa_settings_profile_kids") : null,
          t(x.pinHash ? "sa_settings_profile_pin_lock" : "sa_settings_profile_no_lock"),
        ].filter(Boolean).join(sep);
        return (
          <SRow key={x.id} id={`pf-${x.id}`} icon="PERSON" title={nameOf(x)} line={line}
            end={(
              <span class="set-tags">
                {inUse ? <Tag tint text={t("sa_settings_profile_in_use").toUpperCase()} /> : null}
                {x.kids ? <Tag text={t("sa_profiles_kids_tag").toUpperCase()} /> : null}
                {x.pinHash ? <Tag text={t("sa_profiles_pin").toUpperCase()} /> : null}
                {!inUse ? <span class="set-chev-icon"><SIcon name="CHEVRON" size={20} /></span> : null}
              </span>
            )}
            onOk={() => (inUse ? setEditing(true) : p.onSwitch(x.id))}
            onHold={p.book.profiles.length > 1 ? () => p.onAskDelete(x.id) : undefined} />
        );
      })}
      <SRow id="pf-add" icon="SPARKLE" title={t("sa_settings_profile_add")} line={t("sa_settings_profile_add_line")} onOk={() => setAdding(true)} />
      {editing ? (
        <ProfileEditor book={p.book} onRename={p.onRename} onToggleKids={p.onToggleKids} onSetPin={p.onSetPin} onRemovePin={p.onRemovePin}
          onClose={() => { setEditing(false); setTimeout(() => sheet.focus(`pf-${p.book.activeId}`), 0); }} />
      ) : null}
      <Presence show={adding}>
        {(out) => (
          <TextEntry title={t("sa_profiles_new")} hint="" label={t("sa_profiles_name")} value="" closing={out}
            onCancel={() => { setAdding(false); setTimeout(() => sheet.focus("pf-add"), 0); }}
            onDone={(name) => { setAdding(false); if (name.trim()) p.onAdd(name.trim()); else setTimeout(() => sheet.focus("pf-add"), 0); }} />
        )}
      </Presence>
    </>
  );
}

/**
 * The profile editor (ProfileComponents.kt ProfileEditorDialog), for the profile in use: its name, kids mode and PIN.
 * The name and kids mode are kept on "Сохранить"; the PIN is set or removed at once through the app's PIN question.
 */
function ProfileEditor(p: { book: ProfileBook; onRename: (n: string) => void; onToggleKids: () => void; onSetPin: () => void; onRemovePin: () => void; onClose: () => void }) {
  const me = p.book.profiles.find((x) => x.id === p.book.activeId)!;
  const [name, setName] = useState(me.guest ? "" : me.name);
  const [kids, setKids] = useState(!!me.kids);
  const [typing, setTyping] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useOwnBack(root, p.onClose);
  useEffect(() => { setTimeout(() => focusFirst(document, me.guest ? "pe-kids" : "pe-name"), 0); }, []);
  const save = () => {
    if (!me.guest && name.trim() && name.trim() !== me.name) p.onRename(name.trim());
    if (kids !== !!me.kids) p.onToggleKids();
    p.onClose();
  };
  return (
    <OverSheet app>
      <div ref={root}>
        <Popup title={t("sa_profiles_edit")} width={880} onClose={p.onClose}
          buttons={<><Button small id="pe-cancel" text={t("sa_common_cancel")} onClick={p.onClose} /><Button small id="pe-save" text={t("sa_common_save")} onClick={save} /></>}>
          {!me.guest ? (
            <button class="st-focusable st-field set-popup-row" data-focus="pe-name" onClick={() => setTyping(true)}>
              <span class="st-setting-icon"><SIcon name="PENCIL" size={32} /></span>
              <span class="st-setting-body"><span class="st-setting-title">{t("sa_profiles_name")}</span><span class="st-setting-value">{name || t("sa_profiles_name_hint")}</span></span>
              <span class="st-field-edit">{t("sa_common_edit")}</span>
            </button>
          ) : null}
          <div class="st-divider" />
          <button class="st-focusable st-option two" data-focus="pe-kids" onClick={() => setKids(!kids)}>
            <span class="st-option-body"><span class="st-option-title">{t("sa_profiles_kids")}</span><span class="st-option-sub">{t("sa_profiles_kids_description")}</span></span>
            <Toggle on={kids} />
          </button>
          <button class="st-focusable st-option two" data-focus="pe-pin" onClick={p.onSetPin}>
            <span class="st-option-body"><span class="st-option-title">{t(me.pinHash ? "sa_profiles_change_pin" : "sa_profiles_optional_pin")}</span><span class="st-option-sub">{t("sa_profiles_pin_digits")}</span></span>
          </button>
          {me.pinHash ? (
            <button class="st-focusable st-option" data-focus="pe-nopin" onClick={p.onRemovePin}>
              <span class="st-option-body"><span class="st-option-title">{t("sa_profiles_remove_pin")}</span></span>
              <Toggle on={false} />
            </button>
          ) : null}
        </Popup>
        <Presence show={typing}>
          {(out) => (
            <TextEntry title={t("sa_profiles_name")} hint="" value={name} closing={out}
              onCancel={() => { setTyping(false); setTimeout(() => focusFirst(document, "pe-name"), 0); }}
              onDone={(v) => { setName(v); setTyping(false); setTimeout(() => focusFirst(document, "pe-name"), 0); }} />
          )}
        </Presence>
      </div>
    </OverSheet>
  );
}
