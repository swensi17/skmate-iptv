import { createPortal } from "preact/compat";
import { useEffect, useState } from "preact/hooks";
import { focusFirst, useOwnBack, useReturnFocus } from "@skmate/ui";
import { t } from "../i18n";
import { isLocal } from "../state/localFiles";
import type { PlaylistEntry } from "../state/playlists";
import { EntryRow } from "./EntryRow";

/**
 * A playlist's name and link, as rows that open the entry panel (the remote never lands in a bare field). A playlist
 * from a file of this device has no link to change. Back closes this dialog only; the focus returns to the row's
 * edit button.
 */
export function EditPlaylist(p: { entry: PlaylistEntry; onSave: (name: string, url: string) => string | null; onClose: () => void }) {
  const fixed = isLocal(p.entry.url);
  const [name, setName] = useState(p.entry.name);
  const [url, setUrl] = useState(fixed ? "" : p.entry.url);
  const [error, setError] = useState<string | null>(null);
  const root = useReturnFocus();
  useOwnBack(root, p.onClose);
  useEffect(() => { focusFirst(document, "pe-name"); }, []);

  const save = () => {
    const err = p.onSave(name, url);
    if (err) { setError(err); return; }
    p.onClose();
  };

  return createPortal(
    <div class="scrim pe-scrim" data-modal ref={root}>
      <div class="dialog wide pe-dialog" role="dialog" aria-label={t("playlistEdit")}>
        <div class="dialog-title">{t("playlistEdit")}</div>
        <div class="dialog-rows pe-rows">
          <EntryRow id="pe-name" title={t("playlistName")} value={name} onDone={(v) => { setName(v); setError(null); }} />
          {fixed ? null : (
            <EntryRow id="pe-url" title={t("entUrlTitle")} value={url} inputMode="url" entryHint={t("entUrlHint")} onDone={(v) => { setUrl(v); setError(null); }} />
          )}
          {error ? <div class="status error">{error}</div> : null}
        </div>
        <div class="dialog-actions pe-actions">
          <button class="btn" data-focus="pe-cancel" onClick={p.onClose}>{t("confirmCancel")}</button>
          <button class="btn" data-focus="pe-save" onClick={save}>{t("playlistSave")}</button>
        </div>
      </div>
    </div>,
    document.getElementById("app") ?? document.body, // inside the scaled stage, above the settings sheet
  );
}
