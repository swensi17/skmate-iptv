import { useState } from "preact/hooks";
import { t } from "../i18n";
import { normalizeUrl, xtreamUrl } from "../state/playlists";

type Kind = "m3u" | "xtream";

/**
 * Where a playlist comes from, as in the Android app: an M3U / M3U8 link, or an Xtream Codes login (server, login,
 * password) that becomes the provider's own M3U link. [onSubmit] gets the link and says what was wrong, if anything.
 */
export function SourceForm(p: { idPrefix: string; onSubmit: (url: string) => string | null; addLabel?: string }) {
  const [kind, setKind] = useState<Kind>("m3u");
  const [url, setUrl] = useState("");
  const [server, setServer] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const link = kind === "m3u" ? normalizeUrl(url) : xtreamUrl(server, user, pass);
    if (!link) { setError(t(kind === "m3u" ? "playlistBadUrl" : "xtBad")); return; }
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
        {(["m3u", "xtream"] as const).map((k) => (
          <button class="seg-item" key={k} data-focus={`${p.idPrefix}-kind-${k}`} aria-pressed={kind === k} onClick={() => { setKind(k); setError(null); }}>
            {t(k === "m3u" ? "srcM3u" : "srcXtream")}
          </button>
        ))}
      </div>
      {kind === "m3u" ? (
        <div class="add">
          {field("url", url, setUrl, t("playlistUrlPlaceholder"))}
          <button class="btn" data-focus={`${p.idPrefix}-add`} onClick={submit}>{p.addLabel ?? t("playlistAdd")}</button>
        </div>
      ) : (
        <div class="xt-fields">
          {field("server", server, setServer, t("xtServer"))}
          <div class="add">
            {field("user", user, setUser, t("xtUser"))}
            {field("pass", pass, setPass, t("xtPass"), "password")}
            <button class="btn" data-focus={`${p.idPrefix}-add`} onClick={submit}>{p.addLabel ?? t("playlistAdd")}</button>
          </div>
        </div>
      )}
      {error ? <div class="status error">{error}</div> : null}
    </div>
  );
}
