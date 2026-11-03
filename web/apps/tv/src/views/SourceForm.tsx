import { useRef, useState } from "preact/hooks";
import { detectPlatform } from "../platform";
import { t } from "../i18n";
import { desktop } from "../state/desktop";
import { canonicalMac, normalizeUrl, stalkerSource, xtreamUrl } from "../state/playlists";

type Kind = "m3u" | "xtream" | "stalker";

/**
 * Where a playlist comes from, as in the Android app: an M3U / M3U8 link, or an Xtream Codes login (server, login,
 * password) that becomes the provider's own M3U link, or (in the Windows app) a Stalker portal and its MAC address.
 * [onSubmit] gets the link and says what was wrong, if anything.
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
  const [url, setUrl] = useState("");
  const [server, setServer] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [portal, setPortal] = useState("");
  const [mac, setMac] = useState("");
  // A portal wants a MAG box's headers, which only the Windows app can send (desktop/stalker.cjs).
  const kinds: Kind[] = desktop() ? ["m3u", "xtream", "stalker"] : ["m3u", "xtream"];
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (kind === "stalker") {
      if (!normalizeUrl(portal)) { setError(t("stkPortalBad")); return; }
      if (!canonicalMac(mac)) { setError(t("stkMacBad")); return; }
    }
    if (p.busy) return;
    const link = kind === "m3u" ? normalizeUrl(url) : kind === "xtream" ? xtreamUrl(server, user, pass) : stalkerSource(portal, mac);
    if (!link) { setError(t(kind === "m3u" ? "playlistBadUrl" : kind === "xtream" ? "xtBad" : "stkPortalBad")); return; }
    const err = p.onSubmit(link);
    setError(err);
    if (!err) { setUrl(""); setPass(""); }
  };
  const field = (id: string, value: string, set: (v: string) => void, placeholder: string, type = "text") => (
    <input
      class="field" data-focus={`${p.idPrefix}-${id}`} value={value} placeholder={placeholder} type={type}
      autocomplete="off" spellcheck={false}
      onInput={(e) => { set((e.currentTarget as HTMLInputElement).value); setError(null); }}
      onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
    />
  );

  return (
    <div class="source-form">
      <div class="seg" role="radiogroup" aria-label={t("srcKind")}>
        {kinds.map((k) => (
          <button class="seg-item" key={k} data-focus={`${p.idPrefix}-kind-${k}`} aria-pressed={kind === k} onClick={() => { setKind(k); setError(null); }}>
            {t(k === "m3u" ? "srcM3u" : k === "xtream" ? "srcXtream" : "stkKind")}
          </button>
        ))}
      </div>
      {kind === "m3u" ? (
        <div class="add">
          {field("url", url, setUrl, t("playlistUrlPlaceholder"))}
          <button class="btn" data-focus={`${p.idPrefix}-add`} onClick={submit} aria-busy={p.busy}>{p.busy ? t("playlistLoading") : (p.addLabel ?? t("playlistAdd"))}</button>
          {canPickFile ? (
            <>
              <button class="btn" data-focus={`${p.idPrefix}-file`} onClick={() => picker.current?.click()}>{t("srcFile")}</button>
              <input ref={picker} type="file" accept=".m3u,.m3u8,.txt,audio/x-mpegurl,application/vnd.apple.mpegurl" style={{ display: "none" }}
                onChange={(e) => pickFile(e.currentTarget as HTMLInputElement)} />
            </>
          ) : null}
        </div>
      ) : kind === "stalker" ? (
        <div class="xt-fields">
          {field("portal", portal, setPortal, `${t("stkPortal")}: http://host:port/c/`)}
          <div class="add">
            {field("mac", mac, setMac, `${t("stkMac")}: 00:1A:79:AA:BB:CC`)}
            <button class="btn" data-focus={`${p.idPrefix}-add`} onClick={submit} aria-busy={p.busy}>{p.busy ? t("playlistLoading") : (p.addLabel ?? t("playlistAdd"))}</button>
          </div>
        </div>
      ) : (
        <div class="xt-fields">
          {field("server", server, setServer, t("xtServer"))}
          <div class="add">
            {field("user", user, setUser, t("xtUser"))}
            {field("pass", pass, setPass, t("xtPass"), "password")}
            <button class="btn" data-focus={`${p.idPrefix}-add`} onClick={submit} aria-busy={p.busy}>{p.busy ? t("playlistLoading") : (p.addLabel ?? t("playlistAdd"))}</button>
          </div>
        </div>
      )}
      {error ? <div class="status error">{error}</div> : null}
    </div>
  );
}
