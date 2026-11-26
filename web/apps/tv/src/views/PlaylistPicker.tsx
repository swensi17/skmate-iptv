import { Drawer, focusFirst, Icon } from "@skmate/ui";
import { useEffect } from "preact/hooks";
import { t } from "../i18n";
import { SheetHead } from "./SheetHead";
import type { PlaylistStore } from "../state/playlists";
import "./settings.css";

/**
 * Quick switch between the playlists from the channel screen, without a trip to Settings: OK on a playlist watches it
 * (the one in use is lighter and says so); adding, changing and deleting are in Settings, one row below the list.
 */
export function PlaylistPicker(p: { store: PlaylistStore; onSelect: (id: string) => void; onManage: () => void; onClose: () => void; closing?: boolean }) {
  useEffect(() => { focusFirst(document, `pk-${p.store.activeId ?? p.store.list[0]?.id ?? "manage"}`); }, []);
  return (
    <Drawer side="bottom" label={t("playlistPickerTitle")} onClose={p.onClose} closing={p.closing} returnFocus>
      <SheetHead title={t("playlistPickerTitle")} />
      <div class="drawer-body drawer-scroll">
        {p.store.list.length > 0 ? <div class="set-note">{t("plPickHint")}</div> : <div class="set-note">{t("plEmpty")}</div>}
        {p.store.list.map((pl) => (
          <button class="row" key={pl.id} data-focus={`pk-${pl.id}`} aria-pressed={p.store.activeId === pl.id}
            onClick={() => { p.onSelect(pl.id); p.onClose(); }}>
            <span class="grow">{pl.name}</span>
            {p.store.activeId === pl.id ? <span class="sub">{t("playlistActive")}</span> : null}
          </button>
        ))}
        <button class="menu-row pk-manage" data-focus="pk-manage" onClick={p.onManage}>
          <Icon name="playlist" size={36} /><span class="grow">{t("playlistManage")}</span>
        </button>
      </div>
    </Drawer>
  );
}
