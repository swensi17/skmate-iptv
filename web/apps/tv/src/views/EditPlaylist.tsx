import { createPortal } from "preact/compat";
import { useEffect, useState } from "preact/hooks";
import { focusFirst } from "@skmate/ui";
import { t } from "../i18n";
import { isLocal } from "../state/localFiles";
import type { PlaylistEntry } from "../state/playlists";

/** A playlist's name and link. A playlist from a file of this device has no link to change. Enter in a field saves. */
export function EditPlaylist(p: { entry: PlaylistEntry; onSave: (name: string, url: string) => string | null; onClose: () => void }) {
  const fixed = isLocal(p.entry.url) || p.entry.url === "demo://playlist";
  const [name, setName] = useState(p.entry.name);
  const [url, setUrl] = useState(fixed ? "" : p.entry.url);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { focusFirst(document, "pe-name"); }, []);

  const save = () => {
    const err = p.onSave(name, url);
    if (err) { setError(err); return; }
    p.onClose();
  };
  const field = (id: string, value: string, set: (v: string) => void, placeholder: string) => (
    <input class="field" style={{ textAlign: "left" }} data-focus={id} value={value} placeholder={placeholder} autocomplete="off" spellcheck={false}
      onInput={(e) => { set((e.currentTarget as HTMLInputElement).value); setError(null); }}
      onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
  );

  return createPortal(
    <div class="scrim" data-modal>
      <div class="dialog" role="dialog" aria-label={t("playlistEdit")}>
        <div class="dialog-title">{t("playlistEdit")}</div>
        <div class="link-form">
          {field("pe-name", name, setName, t("playlistName"))}
          {fixed ? null : field("pe-url", url, setUrl, t("playlistUrlPlaceholder"))}
          {error ? <div class="status error">{error}</div> : null}
        </div>
        <div class="dialog-actions">
          <button class="btn" data-focus="pe-cancel" onClick={p.onClose}>{t("confirmCancel")}</button>
          <button class="btn" data-focus="pe-save" onClick={save}>{t("playlistSave")}</button>
        </div>
      </div>
    </div>,
    document.getElementById("app") ?? document.body, // inside the scaled stage, above the settings sheet
  );
}
