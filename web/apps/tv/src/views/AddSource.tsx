import { Fragment } from "preact";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { focusFirst, Popup, Presence, Segmented, useOwnBack } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { detectPlatform } from "../platform";
import { desktop } from "../state/desktop";
import { canonicalMac, normalizeUrl, stalkerSource, xtreamUrl } from "../state/playlists";
import { SIcon, OverSheet } from "./SettingsKit";
import { TextEntry } from "./TextEntry";

/*
 * Add a source, as the Android app draws it (features/setup/AddSourceScreen.kt, adding, so the short form): a "Type"
 * row with the kinds as a segmented value (◀ ▶ change it), then only what the source cannot work without, one row per
 * value (the pencil, the name, the text or its dim example; OK opens the entry, ▶ jumps to the button), a wrong portal
 * address or MAC said right under its row, anything else under the rows, and the one button, "Start import", dim and
 * out of the focus path until the form can be sent. In Settings it is a window in the middle of the screen
 * (StageFormPage with LocalFormWindow), in the wizard a page.
 */

type Kind = "m3u" | "xtream" | "stalker";
type FieldId = "url" | "server" | "user" | "pass" | "portal" | "mac";

const LEFT = (e: KeyboardEvent) => e.key === "ArrowLeft" || e.keyCode === 37;
const RIGHT = (e: KeyboardEvent) => e.key === "ArrowRight" || e.keyCode === 39;

/** What each field asks for: its name, the example shown while it is empty, the text of its entry panel, whether it is a secret. */
const FIELDS: Record<FieldId, { title: Key; example: Key | null; secret?: boolean }> = {
  url: { title: "sa_setup_playlist_url_local_file", example: "sa_setup_playlist_example" },
  server: { title: "sa_setup_server_url", example: "sa_setup_server_example" },
  user: { title: "sa_setup_username", example: null },
  pass: { title: "sa_setup_password", example: null, secret: true },
  portal: { title: "sa_setup_portal_url", example: "sa_setup_portal_example" },
  mac: { title: "sa_setup_mac_address", example: "sa_setup_mac_example" },
};
const FIELDS_OF: Record<Kind, FieldId[]> = { m3u: ["url"], xtream: ["server", "user", "pass"], stalker: ["portal", "mac"] };
const KIND_LABEL: Record<Kind, Key> = { m3u: "sa_setup_m3u", xtream: "sa_setup_xtream", stalker: "sa_setup_stalker_mac" };

/** A whole "M3U" link of an Xtream account (get.php?username=…&password=…) is the account itself: split it (XtreamM3uLink). */
function splitXtream(typed: string): { server: string; user: string; pass: string } | null {
  try {
    const u = new URL(typed.trim());
    if (!/\/get\.php$/i.test(u.pathname)) return null;
    const user = u.searchParams.get("username");
    const pass = u.searchParams.get("password");
    return user && pass ? { server: `${u.protocol}//${u.host}`, user, pass } : null;
  } catch {
    return null;
  }
}

/** One row of the form (StageSettingRow / StageFieldRow, side = false), on the wizard's row metrics. */
export function FormRow(p: { id: string; icon: string; title: string; line?: string; end?: ComponentChildren; onClick: () => void; onKey?: (e: KeyboardEvent) => void }) {
  return (
    <button class="st-focusable sw-row src-row" data-focus={p.id} onClick={p.onClick} onKeyDown={p.onKey as never}>
      <span class="sw-row-icon"><SIcon name={p.icon} size={36} /></span>
      <span class="sw-row-body">
        <span class="sw-row-title">{p.title}</span>
        {p.line ? <span class="sw-row-line">{p.line}</span> : null}
      </span>
      {p.end ? <span class="sw-row-end">{p.end}</span> : null}
    </button>
  );
}

function Field(p: { id: string; label: string; value: string; example: string; secret?: boolean; open: boolean; shown: boolean; onOpen: () => void; onKey: (e: KeyboardEvent) => void }) {
  const text = p.secret && !p.shown ? "•".repeat(Math.min(p.value.length, 24)) : p.value;
  return (
    <button class={`st-focusable sw-row sw-field src-row${p.open ? " st-lit" : ""}`} data-focus={p.id} onClick={p.onOpen} onKeyDown={p.onKey as never}>
      <span class="sw-field-icon"><SIcon name="PENCIL" size={32} /></span>
      <span class="sw-row-body">
        <span class="sw-row-title">{p.label}</span>
        <span class={p.value ? "sw-field-value" : "sw-field-ph"}>{p.value ? text : p.example}</span>
      </span>
    </button>
  );
}

/** What is wrong with the row above, on its text's line: an alert mark and the reason (AddSourceScreen.kt fieldError). */
function FieldError({ text }: { text: string }) {
  return <div class="src-field-error"><SIcon name="INFO" size={22} /><span>{text}</span></div>;
}

export function AddSourceForm(p: {
  idPrefix: string;
  /** A playlist is loading: adding another now would only restart it. */
  busy?: boolean;
  /** Gets the link and says what was wrong, if anything. */
  onSubmit: (link: string) => string | null;
  /** A playlist from a file of this device (a browser has a file dialog; the TVs' own browsers have none). */
  onFile?: (name: string, text: string) => Promise<string | null>;
}) {
  const id = (s: string) => `${p.idPrefix}-${s}`;
  const canPickFile = !!p.onFile && detectPlatform() === "browser";
  const picker = useRef<HTMLInputElement>(null);
  // A portal wants a MAG box's headers, which only the Windows app can send (desktop/stalker.cjs).
  const kinds: Kind[] = ["m3u", "xtream", ...(desktop() ? ["stalker" as const] : [])];
  const [kind, setKind] = useState<Kind>("m3u");
  const [v, setV] = useState<Record<FieldId, string>>({ url: "", server: "", user: "", pass: "", portal: "", mac: "" });
  const [editing, setEditing] = useState<FieldId | null>(null);
  const [shown, setShown] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => { const h = setTimeout(() => focusFirst(document, id("type")), 30); return () => clearTimeout(h); }, []);

  // What is wrong with what was typed; nothing for an empty field (AddSourceScreen.kt `errors`).
  const hasScheme = (s: string) => s.includes("://");
  const errorScheme = t("sa_setup_error_address_scheme");
  const portalBad = kind === "stalker" && v.portal.trim() !== "" && !normalizeUrl(v.portal);
  const macBad = kind === "stalker" && v.mac.trim() !== "" && !canonicalMac(v.mac);
  const schemeBad = (kind === "xtream" && v.server.trim() !== "" && !hasScheme(v.server.trim()))
    || (kind === "m3u" && v.url.trim() !== "" && !hasScheme(v.url.trim()));
  const footerErrors = [...(schemeBad ? [errorScheme] : []), ...(sent ? [sent] : [])];

  const filled = kind === "m3u" ? v.url.trim() !== ""
    : kind === "xtream" ? v.server.trim() !== "" && v.user.trim() !== "" && v.pass.trim() !== ""
      : !!normalizeUrl(v.portal) && !!canonicalMac(v.mac);
  const canStart = filled && !schemeBad && !portalBad && !macBad && !p.busy;

  const submit = () => {
    if (!canStart) return;
    const link = kind === "m3u" ? normalizeUrl(v.url) : kind === "xtream" ? xtreamUrl(v.server, v.user, v.pass) : stalkerSource(v.portal, v.mac);
    if (!link) { setSent(t(kind === "m3u" ? "playlistBadUrl" : kind === "xtream" ? "xtBad" : "sa_setup_error_portal_address")); return; }
    const err = p.onSubmit(link);
    setSent(err);
    if (!err) setV((x) => ({ ...x, url: "", pass: "" }));
  };

  const step = (d: number) => {
    const i = Math.max(0, Math.min(kinds.length - 1, kinds.indexOf(kind) + d));
    if (kinds[i] !== kind) { setKind(kinds[i]!); setSent(null); }
  };
  const cycle = () => { setKind(kinds[(kinds.indexOf(kind) + 1) % kinds.length]!); setSent(null); };

  const typed = (field: FieldId, value: string) => {
    const split = field === "server" ? splitXtream(value) : null;
    setV((x) => (split ? { ...x, server: split.server, user: split.user, pass: split.pass } : { ...x, [field]: value }));
    setSent(null);
    setEditing(null);
    setTimeout(() => focusFirst(document, id(`f-${field}`)), 0);
  };
  const cancel = () => {
    const f = editing;
    setEditing(null);
    setTimeout(() => focusFirst(document, id(`f-${f}`)), 0);
  };
  const toGo = (e: KeyboardEvent, secret?: boolean) => {
    if (!RIGHT(e)) return;
    if (secret) { e.preventDefault(); e.stopPropagation(); setShown((s) => !s); return; } // a secret's ▶ shows or hides it
    if (canStart) { e.preventDefault(); e.stopPropagation(); focusFirst(document, id("go")); }
  };

  const pickFile = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = ""; // the same file chosen again is read again
    if (!file || !p.onFile) return;
    const reader = new FileReader();
    reader.onload = () => { void p.onFile?.(file.name, String(reader.result ?? "")).then(setSent); };
    reader.onerror = () => setSent(t("srcFileBad"));
    reader.readAsText(file);
  };

  const errorOf = (f: FieldId): string | null => (f === "portal" && portalBad ? t("sa_setup_error_portal_address") : f === "mac" && macBad ? t("sa_setup_mac_invalid") : null);

  return (
    <div class="src-form">
      <FormRow id={id("type")} icon="LIST" title={t("sa_settings_source_type")} line={t("sa_settings_line_source_type")}
        end={<Segmented options={kinds.map((k) => t(KIND_LABEL[k]))} selected={kinds.indexOf(kind)} onPick={(i) => { setKind(kinds[i]!); setSent(null); }} />}
        onClick={cycle}
        onKey={(e) => { const d = LEFT(e) ? -1 : RIGHT(e) ? 1 : 0; if (d !== 0) { e.preventDefault(); e.stopPropagation(); step(d); } }} />
      {FIELDS_OF[kind].map((f) => (
        <Fragment key={`${kind}-${f}`}>
          <Field id={id(`f-${f}`)} label={t(FIELDS[f].title)} value={v[f]} example={FIELDS[f].example ? t(FIELDS[f].example!) : ""} secret={FIELDS[f].secret}
            open={editing === f} shown={shown} onOpen={() => setEditing(f)} onKey={(e) => toGo(e, FIELDS[f].secret)} />
          {errorOf(f) ? <FieldError text={errorOf(f)!} /> : null}
        </Fragment>
      ))}
      {kind === "m3u" && canPickFile ? (
        <>
          <FormRow id={id("file")} icon="DOWNLOADS" title={t("plFilePick")} line={t("plKindHintFile")} onClick={() => picker.current?.click()} onKey={(e) => toGo(e)} />
          <input ref={picker} type="file" accept=".m3u,.m3u8,.txt,audio/x-mpegurl,application/vnd.apple.mpegurl" style={{ display: "none" }}
            onChange={(e) => pickFile(e.currentTarget as HTMLInputElement)} />
        </>
      ) : null}
      <div class="src-foot">
        {footerErrors.map((e) => <div key={e} class="src-error"><SIcon name="INFO" size={24} /><span>{e}</span></div>)}
        <button class={`src-go${canStart ? "" : " off"}`} data-focus={canStart ? id("go") : undefined} tabIndex={canStart ? 0 : -1}
          aria-disabled={!canStart || undefined} aria-busy={p.busy} onClick={submit}>
          <SIcon name="DOWNLOADS" size={26} />
          <span>{p.busy ? t("playlistLoading") : t("sa_setup_start_import")}</span>
        </button>
      </div>
      <Presence show={editing !== null}>
        {(out) => editing ? (
          <TextEntry title={t(FIELDS[editing].title)} hint={t("sa_settings_form_field_help")} label={t(FIELDS[editing].title)} value={v[editing]} closing={out}
            type={FIELDS[editing].secret ? "password" : "text"} onDone={(x) => typed(editing, x)} onCancel={cancel} />
        ) : null}
      </Presence>
    </div>
  );
}

/**
 * The form as a window in the middle of the screen over a scrim (StageFormPage, windowed: 1000 wide, corners 26, the
 * sheet's fill, 40 / 34 inside), under the path "Add a source › Type it here". Back and a tap beside it close it.
 */
export function SourceWindow(p: {
  closing: boolean;
  parents: string[];
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  const root = useRef<HTMLDivElement>(null);
  useOwnBack(root, p.onClose);
  return (
    <OverSheet app>
      <div ref={root}>
        <Popup className="src-window" label={p.title} onClose={p.onClose} closing={p.closing} returnFocus>
          <div class="src-path">
            {p.parents.map((x) => <Fragment key={x}><span class="src-path-parent">{x}</span><span class="src-path-sep">›</span></Fragment>)}
            <span class="src-path-title">{p.title}</span>
          </div>
          <div class="src-body">{p.children}</div>
        </Popup>
      </div>
    </OverSheet>
  );
}
