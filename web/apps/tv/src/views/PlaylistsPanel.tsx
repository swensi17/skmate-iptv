import { useEffect, useRef, useState } from "preact/hooks";
import { PL_EVERY, RefreshRows } from "./refreshRows";
import { focusFirst, Icon, Popup, Presence, Toggle, useOwnBack } from "@skmate/ui";
import { t } from "../i18n";
import { desktop, type CompanionPayload } from "../state/desktop";
import { isLocal } from "../state/localFiles";
import { AUTHOR_NAME, AUTHOR_URL } from "../state/authorPlaylist";
import { stalkerSource, xtreamUrl, type PlaylistStore } from "../state/playlists";
import type { Status } from "../state/usePlaylists";
import { EditPlaylist } from "./EditPlaylist";
import { LinkDialog } from "./LinkDialog";
import { ChoiceList, EditorLayer, SIcon, SNote, SRow, useSheet, useSheetBack, OverSheet } from "./SettingsKit";
import { AddSourceForm, FormRow, SourceWindow } from "./AddSource";

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
  if (isLocal(url)) return t("plFileSub");
  try { return new URL(url).host; } catch { return ""; }
}

/**
 * Adding a source (ManageSourcesScreen.kt): where the viewer has a phone to fill the form on (the Windows app) a first
 * page asks "From your phone" or "Type it here" (AddSourceChooserScreen.kt); elsewhere the form opens at once. The form
 * is a window over the screen (AddSourceScreen.kt in StageFormPage); once a playlist is added it closes by itself and
 * the list shows the new one in use.
 */
function AddSource(p: {
  closing: boolean; busy: boolean; chooser: boolean; onPhone: () => void; onChooser: () => void; onClose: () => void; onDone: () => void;
  onAdd: (link: string) => string | null; onAddFile: (name: string, text: string) => Promise<string | null>;
}) {
  return (
    <SourceWindow closing={p.closing} parents={p.chooser ? [t("sa_settings_playlists")] : [t("sa_setup_add_source")]} onClose={p.onClose}
      title={p.chooser ? t("sa_setup_add_source") : t("sa_settings_add_type_here")}>
      {p.chooser ? (
        <ChooserRows onPhone={p.onPhone} onType={p.onChooser} />
      ) : (
        <AddSourceForm idPrefix="pl" busy={p.busy}
          onSubmit={(link) => { const err = p.onAdd(link); if (!err) p.onDone(); return err; }}
          onFile={async (name, text) => { const err = await p.onAddFile(name, text); if (!err) p.onDone(); return err; }} />
      )}
    </SourceWindow>
  );
}

/** "From your phone" and "Type it here", each with its short line (AddSourceChooserScreen.kt). */
function ChooserRows(p: { onPhone: () => void; onType: () => void }) {
  useEffect(() => { const h = setTimeout(() => focusFirst(document, "pl-ch-phone"), 30); return () => clearTimeout(h); }, []);
  const end = <span class="sw-chevron"><Icon name="chevron" size={20} /></span>;
  return (
    <div class="src-form">
      <FormRow id="pl-ch-phone" icon="PHONE" title={t("sa_setup_from_phone")} line={t("sa_settings_line_add_from_phone")} end={end} onClick={p.onPhone} />
      <FormRow id="pl-ch-type" icon="PENCIL" title={t("sa_settings_add_type_here")} line={t("sa_settings_line_add_type_here")} end={end} onClick={p.onType} />
    </div>
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
  // null: closed; "choose": the two ways (a phone or here); "type": the form.
  const [adding, setAdding] = useState<"choose" | "type" | null>(null);
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
  // The author playlist: a switch row (ManageSourcesScreen.kt), off until the viewer turns it on; it is then an ordinary
  // playlist called "SkMate". Off asks before removing it.
  const author = p.store.list.find((x) => x.url === AUTHOR_URL) ?? null;
  const namePending = useRef(false);
  useEffect(() => {
    if (author && namePending.current) { namePending.current = false; if (author.name !== AUTHOR_NAME) p.onEdit(author.id, AUTHOR_NAME, AUTHOR_URL); }
  }, [author?.id]);
  const toggleAuthor = () => {
    if (author) { p.onAskDelete(author.id); return; }
    namePending.current = true;
    const err = p.onAdd(AUTHOR_URL);
    if (err) { namePending.current = false; setRemoteError(err); }
  };

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
      <SRow id="pl-author" icon="PLAYLIST" title={t("sa_settings_author_playlist")} line={t("sa_settings_author_playlist_desc")}
        end={<Toggle on={author !== null} />} onOk={toggleAuthor} />
      {p.store.list.length > 0 ? (
        <RefreshRows id="pl-refresh" value={p.every} choices={PL_EVERY} busy={p.status.kind === "loading"} onPick={p.onEvery} onNow={p.onRefresh} />
      ) : null}
      <SRow id="pl-add-open" icon="ADD" title={t("sa_settings_sources_add")} onOk={() => setAdding(desktop() ? "choose" : "type")} />
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
      <Presence show={adding !== null}>
        {(out) => (
          <AddSource closing={out} busy={p.status.kind === "loading"} chooser={adding === "choose"}
            onPhone={() => { setAdding(null); setRemoteError(null); setRemote(true); }} onChooser={() => setAdding("type")}
            onClose={() => { if (adding === "type" && desktop()) { setAdding("choose"); return; } setAdding(null); setTimeout(() => back("pl-add-open"), 0); }}
            onDone={() => setAdding(null)}
            onAdd={p.onAdd} onAddFile={p.onAddFile} />
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
