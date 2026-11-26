import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { Drawer, focusFirst, Presence, useOwnBack } from "@skmate/ui";
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
  /** How many channels the playlist in use has now (0 while it loads). */
  channelCount: number;
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

/**
 * Adding a playlist, as a page of the Settings sheet laid over the list (it appears in place, as pages do on Android):
 * the kinds (link, Xtream, file), the values, the button. Back closes only this page; once a playlist is added it
 * closes by itself and the list shows the new one in use.
 */
function AddSheet(p: { closing: boolean; busy: boolean; onAdd: (link: string) => string | null; onAddFile: (name: string, text: string) => Promise<string | null>; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useOwnBack(root, p.onClose);
  useEffect(() => { focusFirst(document, "pl-kind-m3u"); }, []);
  return createPortal(
    <div ref={root}>
      <Drawer variant="sheet" instant title={t("emptyAdd")} label={t("emptyAdd")} onClose={p.onClose} closing={p.closing} returnFocus>
        <div class="st-sheet-body setting">
          <SourceForm idPrefix="pl" busy={p.busy}
            onSubmit={(link) => { const err = p.onAdd(link); if (!err) p.onClose(); return err; }}
            onFile={async (name, text) => { const err = await p.onAddFile(name, text); if (!err) p.onClose(); return err; }} />
        </div>
      </Drawer>
    </div>,
    document.getElementById("app") ?? document.body, // inside the scaled stage, above the settings sheet
  );
}

/**
 * The playlists, as in TiviMate: the list first (the one in use is lighter and says so; OK on another one switches to
 * it), each with "Edit" and "Delete" in words beside it; whether the one in use is loading or failed is said in its own
 * row. Under the list, one row opens adding one (a link, an Xtream login or a file) in a sheet of its own.
 */
export function PlaylistsPanel(p: Props) {
  // A playlist from a phone, as on Android: the phone opens this computer's address and sends the form (Windows app).
  const [editing, setEditing] = useState<string | null>(null);
  const [remote, setRemote] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
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

  // A playlist was added: the focus goes to it (it is the one in use now, its row says it is loading). One was deleted:
  // the focus goes to the one in use, or to the form when the list is empty.
  const count = useRef(p.store.list.length);
  useEffect(() => {
    const before = count.current;
    count.current = p.store.list.length;
    if (before === p.store.list.length) return;
    const id = p.store.activeId ?? p.store.list[0]?.id;
    setTimeout(() => focusFirst(document, id ? `pl-${id}` : "pl-add-open"), 0);
  }, [p.store.list.length]);

  const statusOf = (id: string, url: string) => {
    if (p.store.activeId !== id) return { text: sourceOf(url), error: false };
    if (p.status.kind === "loading") return { text: t("playlistLoading"), error: false };
    if (p.status.kind === "error") return { text: p.status.message, error: true };
    const where = sourceOf(url);
    return { text: p.channelCount > 0 ? [where, t("channelsN", { n: p.channelCount })].filter(Boolean).join(" · ") : where, error: false };
  };

  return (
    <div class="setting pl-panel">
      <div class="caption">{t("plYours")}</div>
      {p.store.list.length > 0 ? (
        <>
          <div class="set-note">{t("plPickHint")}</div>
          <div class="pl-list">
            {p.store.list.map((pl) => {
              const active = p.store.activeId === pl.id;
              const st = statusOf(pl.id, pl.url);
              return (
                <div class="pl-item" key={pl.id}>
                  <button class="srow pl-row" data-focus={`pl-${pl.id}`} aria-pressed={active} onClick={() => p.onSelect(pl.id)}>
                    <span class="srow-text">
                      <span class="srow-title pl-name">{pl.name}</span>
                      <span class={`srow-hint${st.error ? " pl-bad" : ""}`}>{st.text}</span>
                    </span>
                    {active ? <span class="sub">{t("playlistActive")}</span> : null}
                  </button>
                  <button class="btn pl-act" data-focus={`pl-edit-${pl.id}`} onClick={() => setEditing(pl.id)}>{t("playlistEdit")}</button>
                  <button class="btn pl-act" data-focus={`pl-del-${pl.id}`} onClick={() => p.onAskDelete(pl.id)}>{t("playlistDelete")}</button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div class="set-note">{t("plEmpty")}</div>
      )}
      {editing !== null && p.store.list.some((x) => x.id === editing) ? (
        <EditPlaylist entry={p.store.list.find((x) => x.id === editing)!} onSave={(name, url) => p.onEdit(editing, name, url)} onClose={() => setEditing(null)} />
      ) : null}
      <button class="srow pl-add-open" data-focus="pl-add-open" onClick={() => setAdding(true)}>
        <span class="srow-text">
          <span class="srow-title">{t("emptyAdd")}</span>
          <span class="srow-hint">{t("plAddHint")}</span>
        </span>
      </button>
      <Presence show={adding}>
        {(out) => (
          <AddSheet closing={out} busy={p.status.kind === "loading"} onAdd={p.onAdd} onAddFile={p.onAddFile} onClose={() => setAdding(false)} />
        )}
      </Presence>
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
    </div>
  );
}
