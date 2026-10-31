import { Drawer, focusFirst, Icon } from "@skmate/ui";
import { useEffect } from "preact/hooks";
import { t } from "../i18n";
import { SheetHead } from "./SheetHead";
import type { PlaylistStore } from "../state/playlists";

/** Quick switch between the playlists from the channel screen, without a trip to Settings. */
export function PlaylistPicker(p: { store: PlaylistStore; onSelect: (id: string) => void; onManage: () => void; onClose: () => void; closing?: boolean }) {
  useEffect(() => { focusFirst(document, `pk-${p.store.activeId ?? p.store.list[0]?.id ?? "manage"}`); }, []);
  return (
    <Drawer side="left" width={760} label={t("playlistPickerTitle")} onClose={p.onClose} closing={p.closing}>
      <SheetHead title={t("playlistPickerTitle")} />
      <div class="drawer-body">
        {p.store.list.map((pl) => (
          <button class="row" key={pl.id} data-focus={`pk-${pl.id}`} aria-pressed={p.store.activeId === pl.id}
            onClick={() => { p.onSelect(pl.id); p.onClose(); }}>
            <span class="grow">{pl.name}</span>
            {p.store.activeId === pl.id ? <span class="sub">{t("playlistActive")}</span> : null}
          </button>
        ))}
        <button class="menu-row" data-focus="pk-manage" onClick={p.onManage}>
          <Icon name="playlist" size={36} /><span class="grow">{t("playlistManage")}</span>
        </button>
      </div>
    </Drawer>
  );
}
