import { useState } from "preact/hooks";
import { Icon } from "@skmate/ui";
import { t } from "../i18n";
import { desktop, type CompanionPayload } from "../state/desktop";
import { isLocal } from "../state/localFiles";
import { stalkerSource, xtreamUrl, type PlaylistStore } from "../state/playlists";
import type { Status } from "../state/usePlaylists";
import { EditPlaylist } from "./EditPlaylist";
import { LinkDialog } from "./LinkDialog";
import { SourceForm } from "./SourceForm";

interface Props {
  store: PlaylistStore;
  status: Status;
  onAdd: (input: string) => string | null;
  onAddFile: (name: string, text: string) => Promise<string | null>;
  onSelect: (id: string) => void;
  onEdit: (id: string, name: string, url: string) => string | null;
  onAskDelete: (id: string) => void;
}

/** The line under a playlist's name: where it comes from, never the whole link (it may carry a login or a token). */
function sourceOf(url: string): string {
  if (url === "demo://playlist") return t("plDemoSub");
  if (isLocal(url)) return t("plFileSub");
  try { return new URL(url).host; } catch { return ""; }
}

export function PlaylistsPanel(p: Props) {
  // A playlist from a phone, as on Android: the phone opens this computer's address and sends the form (Windows app).
  const [editing, setEditing] = useState<string | null>(null);
  const [remote, setRemote] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const take = async (x: CompanionPayload) => {
    let err: string | null;
    if (x.type === "m3u" && x.playlistContent.trim()) err = await p.onAddFile(x.playlistFileName || x.name || "playlist.m3u", x.playlistContent);
    else if (x.type === "m3u") err = p.onAdd(x.server);
    else {
      const link = x.type === "xtream" ? xtreamUrl(x.server, x.user, x.pass) : stalkerSource(x.portalUrl, x.mac);
      err = link ? p.onAdd(link) : t(x.type === "xtream" ? "xtBad" : "stkMacBad");
    }
    setRemoteError(err);
    if (!err) setRemote(false);
  };

  return (
    <div class="setting pl-panel">
      {p.store.list.length > 0 ? (
        <>
          <div class="caption">{t("plYours")}</div>
          <div class="pl-list">
            {p.store.list.map((pl) => {
              const active = p.store.activeId === pl.id;
              return (
                <div class="pl-item" key={pl.id}>
                  <button class="srow pl-row" data-focus={`pl-${pl.id}`} aria-pressed={active} onClick={() => p.onSelect(pl.id)}>
                    <span class="srow-text">
                      <span class="srow-title">{pl.name}</span>
                      <span class="srow-hint">{sourceOf(pl.url)}</span>
                    </span>
                    {active ? <span class="sub">{t("playlistActive")}</span> : null}
                  </button>
                  <button class="icon-btn" data-focus={`pl-edit-${pl.id}`} aria-label={t("playlistEdit")} title={t("playlistEdit")} onClick={() => setEditing(pl.id)}>
                    <Icon name="edit" size={30} />
                  </button>
                  <button class="icon-btn" data-focus={`pl-del-${pl.id}`} aria-label={t("playlistDelete")} title={t("playlistDelete")} onClick={() => p.onAskDelete(pl.id)}>
                    <Icon name="trash" size={30} />
                  </button>
                </div>
              );
            })}
          </div>
          {/* The active playlist did not load: said right under the list, not under the form below. */}
          {p.status.kind === "error" ? <div class="status error pl-error">{p.status.message}</div> : null}
        </>
      ) : null}
      {editing !== null && p.store.list.some((x) => x.id === editing) ? (
        <EditPlaylist entry={p.store.list.find((x) => x.id === editing)!} onSave={(name, url) => p.onEdit(editing, name, url)} onClose={() => setEditing(null)} />
      ) : null}
      <div class="caption pl-add-caption">{t("emptyAdd")}</div>
      <SourceForm idPrefix="pl" onSubmit={p.onAdd} onFile={p.onAddFile} busy={p.status.kind === "loading"} />
      {desktop() ? (
        <button class="srow" data-focus="pl-remote" onClick={() => { setRemoteError(null); setRemote(true); }}>
          <span class="srow-text"><span class="srow-title">{t("fromPhone")}</span><span class="srow-hint">{t("fromPhoneWifi")}</span></span>
        </button>
      ) : null}
      {remote ? (
        <LinkDialog mode="add" title={t("fromPhone")} hints={[t("fromPhoneHint")]} onClose={() => setRemote(false)}
          onEvent={(e) => { if (e.kind === "payload") void take(e.payload); }}>
          {remoteError ? <div class="status error" style={{ textAlign: "center" }}>{remoteError}</div> : null}
        </LinkDialog>
      ) : null}
      {p.status.kind === "error" && p.store.list.length === 0 ? <div class="status error">{p.status.message}</div> : null}
    </div>
  );
}
