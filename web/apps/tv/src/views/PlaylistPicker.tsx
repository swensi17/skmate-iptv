import { focusFirst, Menu, MenuItem } from "@skmate/ui";
import { useEffect } from "preact/hooks";
import { t } from "../i18n";
import type { PlaylistStore } from "../state/playlists";
import "./settings.css";

/**
 * Quick switch between the playlists from the channel screen, without a trip to Settings. As Android's playlist
 * switcher (shell/components/PlaylistPickerDialog.kt `StagePlaylistMenu`): a menu card at the top right over the
 * wash, the one in use ticked, focus starting on it; OK on another one watches it. Adding, changing and deleting are
 * in Settings, one row below the list.
 */
export function PlaylistPicker(p: { store: PlaylistStore; onSelect: (id: string) => void; onManage: () => void; onClose: () => void; closing?: boolean }) {
  useEffect(() => { focusFirst(document, `pk-${p.store.activeId ?? p.store.list[0]?.id ?? "manage"}`); }, []);
  return (
    <Menu place="top-end" title={t("playlistPickerTitle")} subtitle={t(p.store.list.length > 0 ? "plPickHint" : "plEmpty")}
      onClose={p.onClose} closing={p.closing} returnFocus
      footer={<MenuItem id="pk-manage" icon="playlist" text={t("playlistManage")} onClick={p.onManage} />}>
      {p.store.list.map((pl) => (
        <MenuItem key={pl.id} id={`pk-${pl.id}`} text={pl.name} checked={p.store.activeId === pl.id}
          onClick={() => { p.onSelect(pl.id); p.onClose(); }} />
      ))}
    </Menu>
  );
}
