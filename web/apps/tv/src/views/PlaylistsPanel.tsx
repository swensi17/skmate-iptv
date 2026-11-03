import { useState } from "preact/hooks";
import { t } from "../i18n";
import { desktop, type CompanionPayload } from "../state/desktop";
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
    <div class="setting">
      <div class="setting-title">{t("settingsPlaylists")}</div>
      {p.store.list.map((pl) => (
        <div class="playlist" key={pl.id}>
          <button class="row" data-focus={`pl-${pl.id}`} aria-pressed={p.store.activeId === pl.id} onClick={() => p.onSelect(pl.id)}>
            <span class="grow">{pl.name}</span>
            {p.store.activeId === pl.id ? <span class="sub">{t("playlistActive")}</span> : null}
          </button>
          <button class="btn" data-focus={`pl-edit-${pl.id}`} onClick={() => setEditing(pl.id)}>{t("playlistEdit")}</button>
          <button class="btn" data-focus={`pl-del-${pl.id}`} onClick={() => p.onAskDelete(pl.id)}>{t("playlistDelete")}</button>
        </div>
      ))}
      {editing !== null && p.store.list.some((x) => x.id === editing) ? (
        <EditPlaylist entry={p.store.list.find((x) => x.id === editing)!} onSave={(name, url) => p.onEdit(editing, name, url)} onClose={() => setEditing(null)} />
      ) : null}
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
      {p.status.kind === "error" ? <div class="status error">{p.status.message}</div> : null}
    </div>
  );
}
