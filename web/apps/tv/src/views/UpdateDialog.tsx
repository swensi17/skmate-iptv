import { useEffect, useRef } from "preact/hooks";

/** Android UpdateDialog.kt: Up / Down scroll the notes by 200 px while focus stays on the buttons; at either end the arrow is left alone. */
const NOTES_STEP = 200;
import { Button, focusFirst, Popup, useOwnBack } from "@skmate/ui";
import { t } from "../i18n";
import type { Release } from "../state/updates";
import type { UpdateState } from "../state/useUpdates";
import { Spinner } from "./Spinner";
import { tf, OverSheet } from "./SettingsKit";

/** The release's version and notes, as UpdateDialog.kt's Available state draws them. */
function Notes({ release }: { release: Release }) {
  const notes = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = notes.current;
      if (!el) return;
      const down = e.key === "ArrowDown" || e.keyCode === 40;
      const up = e.key === "ArrowUp" || e.keyCode === 38;
      if (!down && !up) return;
      const canForward = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      const canBackward = el.scrollTop > 0;
      if (down ? !canForward : !canBackward) return;
      e.preventDefault(); e.stopPropagation();
      el.scrollTop += down ? NOTES_STEP : -NOTES_STEP;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return (
    <div class="set-update">
      <div class="set-update-version">{tf("sa_update_available_version", release.version)}</div>
      {release.notes ? (
        <>
          <div class="set-label">{t("sa_update_whats_new").toUpperCase()}</div>
          <div class="set-update-notes" ref={notes} style={{ scrollBehavior: "smooth" }}>{release.notes}</div>
        </>
      ) : null}
    </div>
  );
}

/** A new version is out (found by itself): install it now, or leave it until the next start. Focus starts on Update now. */
export function UpdateDialog(p: { release: Release; installing: boolean; onInstall: () => void; onLater: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useOwnBack(root, () => { if (!p.installing) p.onLater(); });
  useEffect(() => { setTimeout(() => focusFirst(document, "update-ok"), 0); }, []);
  return (
    <OverSheet>
      <div ref={root}>
        <Popup title={t("sa_update_title")} width={900} onClose={p.onLater} returnFocus
          buttons={p.installing ? undefined : (
            <>
              <Button small id="update-later" text={t("sa_update_later")} onClick={p.onLater} />
              <Button small id="update-ok" text={t("sa_update_now")} onClick={p.onInstall} />
            </>
          )}>
          {p.installing ? <div class="set-update-busy"><Spinner /><span>{t("updateInstalling")}</span></div> : <Notes release={p.release} />}
        </Popup>
      </div>
    </OverSheet>
  );
}

/**
 * Общие настройки › Проверить обновления (UpdateDialog.kt): the check runs as it opens; checking, up to date, a new
 * version (Позже / Обновить сейчас), installing, failed (Закрыть / Попробовать ещё раз). A web app updates by loading
 * the new build, so "install" reloads the page.
 */
export function UpdatePopup(p: { state: UpdateState; check: () => void; install: () => void; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useOwnBack(root, p.onClose);
  useEffect(() => { p.check(); }, []);
  const s = p.state;
  useEffect(() => { setTimeout(() => focusFirst(document, s.kind === "found" ? "upd-now" : s.kind === "failed" ? "upd-retry" : "upd-close"), 0); }, [s.kind]);
  const busy = s.kind === "checking" || s.kind === "idle" || s.kind === "installing";
  const buttons = busy ? undefined : s.kind === "found" ? (
    <><Button small id="upd-later" text={t("sa_update_later")} onClick={p.onClose} /><Button small id="upd-now" text={t("sa_update_now")} onClick={p.install} /></>
  ) : s.kind === "failed" ? (
    <><Button small id="upd-close" text={t("sa_settings_close")} onClick={p.onClose} /><Button small id="upd-retry" text={t("sa_update_try_again")} onClick={p.install} /></>
  ) : <Button small id="upd-close" text={t("sa_settings_close")} onClick={p.onClose} />;
  return (
    <OverSheet>
      <div ref={root}>
        <Popup title={t("sa_update_title")} width={900} onClose={p.onClose} returnFocus buttons={buttons}>
          {busy ? (
            <div class="set-update-busy"><Spinner /><span>{s.kind === "installing" ? t("updateInstalling") : t("sa_update_checking")}</span></div>
          ) : s.kind === "found" ? <Notes release={s.release} />
            : s.kind === "failed" ? <div class="set-update-text error">{t("updFailed", { version: s.release.version })}</div>
              : s.kind === "unreachable" ? <div class="set-update-text">{t("updUnreachable")}</div>
                : <div class="set-update-text">{tf("sa_update_latest", __APP_VERSION__)}</div>}
        </Popup>
      </div>
    </OverSheet>
  );
}
