import { useEffect, useRef, useState } from "preact/hooks";
import { PL_EVERY, RefreshRows } from "./refreshRows";
import { Drawer, focusFirst, Popup, Presence, useOwnBack } from "@skmate/ui";
import { t } from "../i18n";
import { desktop, type CompanionPayload } from "../state/desktop";
import { isLocal } from "../state/localFiles";
import { stalkerSource, xtreamUrl, type PlaylistStore } from "../state/playlists";
import type { Status } from "../state/usePlaylists";
import { EditPlaylist } from "./EditPlaylist";
import { LinkDialog } from "./LinkDialog";
import { ChoiceList, EditorLayer, SIcon, SNote, SRow, useSheet, useSheetBack, OverSheet } from "./SettingsKit";
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
  /** Settings › playlist update (2.6.9) and "Update now". */
  every: number;
  onEvery: (v: number) => void;
  onRefresh: () => void;
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
  return (
    <OverSheet app>
      <div ref={root}>
        <Drawer variant="sheet" instant title={t("sa_settings_sources_add")} label={t("sa_settings_sources_add")} onClose={p.onClose} closing={p.closing} returnFocus>
          <div class="st-sheet-body setting">
            <SourceForm idPrefix="pl" busy={p.busy}
              onSubmit={(link) => { const err = p.onAdd(link); if (!err) p.onClose(); return err; }}
              onFile={async (name, text) => { const err = await p.onAddFile(name, text); if (!err) p.onClose(); return err; }} />
          </div>
        </Drawer>
      </div>
    </OverSheet>
  );
}

/** `RowActionsPopup` (SettingsStage.kt): StagePopup 600 wide, the item's name as its title, one option per action. */
function ActionsPopup(p: { title: string; actions: Array<{ icon: string; text: string; danger?: boolean; run: () => void }>; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useOwnBack(root, p.onClose);
  useEffect(() => { setTimeout(() => focusFirst(document, "act-0"), 0); }, []);
  return (
    <OverSheet app>
      <div ref={root}>
        <Popup title={p.title} width={600} onClose={p.onClose} returnFocus>
          {p.actions.map((a, i) => (
            <button key={a.text} class={`st-focusable st-option${a.danger ? " danger" : ""}`} data-focus={`act-${i}`} onClick={() => { p.onClose(); a.run(); }}>
              <span class={`st-option-lead${a.danger ? " set-danger" : ""}`}><SIcon name={a.icon} size={28} /></span>
              <span class="st-option-body"><span class="st-option-title">{a.text}</span></span>
            </button>
          ))}
        </Popup>
      </div>
    </OverSheet>
  );
}

/**
 * Плейлисты (ManageSourcesScreen.kt in the sheet): "Показывать плейлист" when there are several, one row per playlist
 * (its source and channels under the name, "По умолчанию" on the one in use; OK opens its actions), then "Добавить
 * плейлист". The web app has no "all playlists at once", nor off / info / re-sync / clean names: Edit and Delete only.
 */
export function PlaylistsPanel(p: Props) {
  // A playlist from a phone, as on Android: the phone opens this computer's address and sends the form (Windows app).
  const [editing, setEditing] = useState<string | null>(null);
  const [remote, setRemote] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [actions, setActions] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const sheet = useSheet();
  const back = (id: string) => sheet.focus(id);
  useSheetBack(choosing, () => { setChoosing(false); back("pl-show"); });
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

  // A playlist was added: the focus goes to it. One was deleted: to the one in use, or to "Add" when none is left.
  const count = useRef(p.store.list.length);
  useEffect(() => {
    const before = count.current;
    count.current = p.store.list.length;
    if (before === p.store.list.length) return;
    const id = p.store.activeId ?? p.store.list[0]?.id;
    back(id ? `pl-${id}` : "pl-add-open");
  }, [p.store.list.length]);

  const lineOf = (id: string, url: string): { text: string; error?: boolean } => {
    const where = sourceOf(url);
    if (p.store.activeId !== id) return { text: where };
    if (p.status.kind === "loading") return { text: t("playlistLoading") };
    if (p.status.kind === "error") return { text: p.status.message, error: true };
    return { text: t("sa_settings_sources_default") };
  };
  const active = p.store.list.find((x) => x.id === p.store.activeId) ?? null;
  const acting = p.store.list.find((x) => x.id === actions) ?? null;

  return (
    <div class="pl-panel">
      {p.store.list.length === 0 ? <SNote title={t("sa_settings_sources_empty")} /> : null}
      {p.store.list.length > 1 ? (
        <SRow id="pl-show" icon="LIST" title={t("sa_settings_show_playlist")} line={active?.name ?? ""} marked={choosing} onOk={() => setChoosing(true)} />
      ) : null}
      {p.store.list.map((pl) => {
        const st = lineOf(pl.id, pl.url);
        return (
          <SRow key={pl.id} id={`pl-${pl.id}`} icon="PLAYLIST" title={pl.name} line={st.text} className={st.error ? "pl-bad" : undefined}
            onOk={() => setActions(pl.id)} />
        );
      })}
      {p.store.list.length > 0 ? (
        <RefreshRows id="pl-refresh" value={p.every} choices={PL_EVERY} busy={p.status.kind === "loading"} onPick={p.onEvery} onNow={p.onRefresh} />
      ) : null}
      <SRow id="pl-add-open" icon="ADD" title={t("sa_settings_sources_add")} onOk={() => setAdding(true)} />
      {desktop() ? (
        <SRow id="pl-remote" icon="PHONE" title={t("fromPhone")} line={t("fromPhoneWifi")} onOk={() => { setRemoteError(null); setRemote(true); }} />
      ) : null}
      {choosing ? (
        <EditorLayer title={t("sa_settings_show_playlist")}>
          <ChoiceList value={p.store.activeId} options={p.store.list.map((x) => ({ value: x.id as string | null, label: x.name }))}
            onPick={(id) => { if (id) p.onSelect(id); setChoosing(false); back("pl-show"); }} onClose={() => { setChoosing(false); back("pl-show"); }} />
        </EditorLayer>
      ) : null}
      {acting ? (
        <ActionsPopup title={acting.name} onClose={() => setActions(null)} actions={[
          ...(p.store.activeId !== acting.id ? [{ icon: "PLAYLIST", text: t("sa_settings_show_playlist"), run: () => p.onSelect(acting.id) }] : []),
          { icon: "PENCIL", text: t("sa_settings_sources_edit"), run: () => setEditing(acting.id) },
          { icon: "TRASH", text: t("sa_settings_sources_delete"), danger: true, run: () => p.onAskDelete(acting.id) },
        ]} />
      ) : null}
      {editing !== null && p.store.list.some((x) => x.id === editing) ? (
        <EditPlaylist entry={p.store.list.find((x) => x.id === editing)!} onSave={(name, url) => p.onEdit(editing, name, url)}
          onClose={() => { const id = editing; setEditing(null); back(`pl-${id}`); }} />
      ) : null}
      <Presence show={adding}>
        {(out) => (
          <AddSheet closing={out} busy={p.status.kind === "loading"} onAdd={p.onAdd} onAddFile={p.onAddFile} onClose={() => setAdding(false)} />
        )}
      </Presence>
      {remote ? (
        <LinkDialog mode="add" title={t("fromPhone")} hints={[t("fromPhoneHint")]} onClose={() => setRemote(false)}
          onEvent={(e) => { if (e.kind === "payload") void take(e.payload); }}>
          {remoteError ? <div class="status error" style={{ textAlign: "center" }}>{remoteError}</div> : null}
        </LinkDialog>
      ) : null}
    </div>
  );
}
