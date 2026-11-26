import { Fragment } from "preact";
import { useRef, useState } from "preact/hooks";
import { focusFirst, Presence } from "@skmate/ui";
import { detectPlatform } from "../platform";
import { t, type Key } from "../i18n";
import { desktop } from "../state/desktop";
import { canonicalMac, normalizeUrl, stalkerSource, xtreamUrl } from "../state/playlists";
import { SIcon } from "./SettingsKit";
import { TextEntry } from "./TextEntry";

type Kind = "m3u" | "xtream" | "stalker" | "file";
type FieldId = "url" | "server" | "user" | "pass" | "portal" | "mac";

/** What each field asks for: its name on the row, the example in the entry panel, and whether it is a secret. */
const FIELDS: Record<FieldId, { title: Key; hint: Key; secret?: boolean }> = {
  url: { title: "entUrlTitle", hint: "entUrlHint" },
  server: { title: "entServerTitle", hint: "entServerHint" },
  user: { title: "xtUser", hint: "entUserHint" },
  pass: { title: "xtPass", hint: "entPassHint", secret: true },
  portal: { title: "stkPortal", hint: "stkPortalHint" },
  mac: { title: "stkMac", hint: "stkMacHint" },
};

const FIELDS_OF: Record<Kind, FieldId[]> = { m3u: ["url"], xtream: ["server", "user", "pass"], stalker: ["portal", "mac"], file: [] };
/** The kinds as the viewer reads them, and one line under them on what to have at hand. */
const KIND_LABEL: Record<Kind, Key> = { m3u: "srcM3u", xtream: "srcXtream", stalker: "stkKind", file: "plKindFile" };
const KIND_HINT: Record<Kind, Key> = { m3u: "plKindHintM3u", xtream: "plKindHintXtream", stalker: "plKindHintStalker", file: "plKindHintFile" };

/**
 * Where a playlist comes from, as in the Android app: an M3U / M3U8 link, or an Xtream Codes login (server, login,
 * password) that becomes the provider's own M3U link, or (in the Windows app) a Stalker portal and its MAC address, or
 * (where a file dialog exists) a file of this device. One line under the kinds says what to have at hand.
 * Each value is a row that says what it is and what is filled in; OK on a row opens a panel to type it (TextEntry),
 * so a remote never lands in a bare text box. [onSubmit] gets the link and says what was wrong, if anything.
 */
export function SourceForm(p: {
  idPrefix: string;
  onSubmit: (url: string) => string | null;
  addLabel?: string;
  /** A playlist is loading: adding another now would only restart it. */
  busy?: boolean;
  /** A playlist from a file of this device: the error text, or null when it was taken. */
  onFile?: (name: string, text: string) => Promise<string | null>;
}) {
  // A file dialog exists in a browser and in the Windows app; the TVs' own browsers have none.
  const canPickFile = !!p.onFile && detectPlatform() === "browser";
  const picker = useRef<HTMLInputElement>(null);
  const pickFile = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = ""; // the same file chosen again is read again
    if (!file || !p.onFile) return;
    const reader = new FileReader();
    reader.onload = () => { void p.onFile?.(file.name, String(reader.result ?? "")).then(setError); };
    reader.onerror = () => setError(t("srcFileBad"));
    reader.readAsText(file);
  };
  const [kind, setKind] = useState<Kind>("m3u");
  const [values, setValues] = useState<Record<FieldId, string>>({ url: "", server: "", user: "", pass: "", portal: "", mac: "" });
  const [editing, setEditing] = useState<FieldId | null>(null);
  // A portal wants a MAG box's headers, which only the Windows app can send (desktop/stalker.cjs).
  const kinds: Kind[] = ["m3u", "xtream", ...(desktop() ? ["stalker" as const] : []), ...(canPickFile ? ["file" as const] : [])];
  const [error, setError] = useState<string | null>(null);
  // Android 2.5.2 (e35591f, AddSourceScreen.kt fieldError): a portal's address and MAC say what is wrong right under
  // themselves, not at the foot of the form: as soon as what was typed is wrong, or when adding found one missing.
  const [tried, setTried] = useState(false);
  const v = values;
  const fieldError = (id: FieldId): string | null => {
    if (kind !== "stalker" || (!tried && v[id].trim() === "")) return null;
    if (id === "portal") return normalizeUrl(v.portal) ? null : t("stkPortalBad");
    if (id === "mac") return canonicalMac(v.mac) ? null : t("stkMacBad");
    return null;
  };

  const submit = () => {
    if (kind === "stalker" && (!normalizeUrl(v.portal) || !canonicalMac(v.mac))) { setTried(true); setError(null); return; }
    if (p.busy) return;
    const link = kind === "m3u" ? normalizeUrl(v.url) : kind === "xtream" ? xtreamUrl(v.server, v.user, v.pass) : stalkerSource(v.portal, v.mac);
    if (!link) { setError(t(kind === "m3u" ? "playlistBadUrl" : kind === "xtream" ? "xtBad" : "stkPortalBad")); return; }
    if (kind === "file") return;
    const err = p.onSubmit(link);
    setError(err);
    if (!err) setValues((x) => ({ ...x, url: "", pass: "" }));
  };

  // After a value is typed, the remote moves on: to the next empty field, or to the button that adds the playlist.
  const typed = (id: FieldId, value: string) => {
    setValues((x) => ({ ...x, [id]: value }));
    setError(null);
    setEditing(null);
    const fields = FIELDS_OF[kind];
    const next = fields.slice(fields.indexOf(id) + 1).find((f) => !values[f]);
    setTimeout(() => focusFirst(document, `${p.idPrefix}-${next ? `f-${next}` : "add"}`), 0);
  };
  const cancel = () => {
    const id = editing;
    setEditing(null);
    setTimeout(() => focusFirst(document, `${p.idPrefix}-f-${id}`), 0);
  };

  const shown = (id: FieldId) => (FIELDS[id].secret ? "•".repeat(Math.min(v[id].length, 12)) : v[id]);

  return (
    <div class="source-form">
      <div class="seg" role="radiogroup" aria-label={t("srcKind")}>
        {kinds.map((k) => (
          <button class="seg-item" key={k} data-focus={`${p.idPrefix}-kind-${k}`} aria-pressed={kind === k} onClick={() => { setKind(k); setError(null); setTried(false); }}>
            {t(KIND_LABEL[k])}
          </button>
        ))}
      </div>
      <div class="src-hint">{t(KIND_HINT[kind])}</div>
      {FIELDS_OF[kind].length > 0 ? (
        <div class="src-fields">
          {FIELDS_OF[kind].map((id) => {
            const wrong = fieldError(id);
            return (
              <Fragment key={id}>
                <button class="srow src-field" data-focus={`${p.idPrefix}-f-${id}`} onClick={() => setEditing(id)}>
                  <span class="srow-text">
                    <span class="srow-title">{t(FIELDS[id].title)}</span>
                    <span class={v[id] ? "src-value" : "srow-hint"}>{v[id] ? shown(id) : t("entEmpty")}</span>
                  </span>
                </button>
                {wrong ? <div class="src-field-error"><SIcon name="INFO" size={22} /><span>{wrong}</span></div> : null}
              </Fragment>
            );
          })}
        </div>
      ) : null}
      {/* What went wrong is said right here, between the values and the button that sends them. */}
      {error ? <div class="status error src-error">{error}</div> : null}
      <div class="src-actions">
        {kind === "file" ? (
          <>
            <button class="btn primary" data-focus={`${p.idPrefix}-add`} onClick={() => picker.current?.click()} aria-busy={p.busy}>
              {p.busy ? t("playlistLoading") : t("plFilePick")}
            </button>
            <input ref={picker} type="file" accept=".m3u,.m3u8,.txt,audio/x-mpegurl,application/vnd.apple.mpegurl" style={{ display: "none" }}
              onChange={(e) => pickFile(e.currentTarget as HTMLInputElement)} />
          </>
        ) : (
          <button class="btn primary" data-focus={`${p.idPrefix}-add`} onClick={submit} aria-busy={p.busy}>
            {p.busy ? t("playlistLoading") : (p.addLabel ?? t("playlistAdd"))}
          </button>
        )}
      </div>
      <Presence show={editing !== null}>
        {(out) => editing ? (
          <TextEntry title={t(FIELDS[editing].title)} hint={t(FIELDS[editing].hint)} value={v[editing]} closing={out}
            type={FIELDS[editing].secret ? "password" : "text"} onDone={(x) => typed(editing, x)} onCancel={cancel} />
        ) : null}
      </Presence>
    </div>
  );
}
