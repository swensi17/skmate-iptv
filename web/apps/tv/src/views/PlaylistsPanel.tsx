import { useState } from "preact/hooks";
import { t } from "../i18n";
import type { PlaylistStore } from "../state/playlists";
import type { Status } from "../state/usePlaylists";

interface Props {
  store: PlaylistStore;
  status: Status;
  onAdd: (input: string) => string | null;
  onSelect: (id: string) => void;
  onAskDelete: (id: string) => void;
}

export function PlaylistsPanel(p: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const err = p.onAdd(url);
    setError(err);
    if (!err) setUrl("");
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
          <button class="btn" data-focus={`pl-del-${pl.id}`} onClick={() => p.onAskDelete(pl.id)}>{t("playlistDelete")}</button>
        </div>
      ))}
      <div class="add">
        <input
          class="field" data-focus="pl-url" value={url} placeholder={t("playlistUrlPlaceholder")}
          onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <button class="btn" data-focus="pl-add" onClick={submit}>{t("playlistAdd")}</button>
      </div>
      {error ? <div class="status error">{error}</div> : null}
      {!error && p.status.kind === "loading" ? <div class="status">{t("playlistLoading")}</div> : null}
      {!error && p.status.kind === "error" ? <div class="status error">{p.status.message}</div> : null}
    </div>
  );
}
