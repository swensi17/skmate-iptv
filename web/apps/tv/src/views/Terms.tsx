import { useEffect, useRef, useState } from "preact/hooks";
import { Button, focusFirst, isBack } from "@skmate/ui";
import { t, type Key } from "../i18n";
import "./wizard.css";

/** Bumped when the terms change materially: everyone is asked again, once (Android TermsOfUseScreen.kt TERMS_VERSION). */
export const TERMS_VERSION = 1;
const KEY = "skmate.termsAccepted";

/** The terms, section by section: a heading (none for the opening) and its text (Android `TermsSections`). */
const SECTIONS: Array<[Key | null, Key]> = [
  [null, "wizTermsIntro"],
  ["wizTermsHPlayer", "wizTermsPlayer"],
  ["wizTermsHContent", "wizTermsContent"],
  ["wizTermsHData", "wizTermsData"],
  ["wizTermsHWarranty", "wizTermsWarranty"],
  ["wizTermsHLiability", "wizTermsLiability"],
  ["wizTermsHLicense", "wizTermsLicense"],
  ["wizTermsHChanges", "wizTermsChanges"],
  ["wizTermsHContact", "wizTermsContact"],
];
/** ▲ ▼ scroll the text by this much (Android SCROLL_STEP). */
const SCROLL_STEP = 160;

function accepted(): boolean {
  try { return Number(localStorage.getItem(KEY) ?? "0") >= TERMS_VERSION; } catch { return false; }
}

/** Declining closes the app, as Android's finishAffinity(): Tizen has its own call, webOS and a browser close the window. */
function exitApp(): void {
  const tizen = (window as unknown as { tizen?: { application?: { getCurrentApplication(): { exit(): void } } } }).tizen;
  try { if (tizen?.application) { tizen.application.getCurrentApplication().exit(); return; } } catch { /* fall through */ }
  window.close();
}

/**
 * The terms of use, before anything else, once (Android features/setup/TermsOfUseScreen.kt): on a new install and for
 * those who already had the app. Accepting is kept by [TERMS_VERSION]; declining closes the app. ▲ ▼ read the text
 * while the focus stays on the buttons, so nothing has to be scrolled before Accept. It keeps its own state, so the
 * host only mounts it; it draws over the first-run wizard (and under the popups).
 */
export function Terms() {
  const [open, setOpen] = useState(() => !accepted());
  const root = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);

  // Focus once the buttons are placed (Android asks after 150 ms: asked in the first frame it landed on Decline).
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => focusFirst(root.current ?? document, "terms-accept"), 150);
    return () => clearTimeout(id);
  }, [open]);

  // The text glides to where the presses so far point (Android animateScrollBy); a press during the glide adds to it.
  // Drawn frame by frame here: a browser's own smooth scrolling restarts badly when presses come quickly.
  const glide = useRef<{ to: number; frame: number }>({ to: 0, frame: 0 });
  const scrollText = (by: number) => {
    const el = text.current;
    if (!el) return;
    const g = glide.current;
    const max = el.scrollHeight - el.clientHeight;
    g.to = Math.max(0, Math.min(max, (g.frame ? g.to : el.scrollTop) + by));
    if (g.frame) return;
    const step = () => {
      const left = g.to - el.scrollTop;
      const before = el.scrollTop;
      if (Math.abs(left) >= 1) el.scrollTop = before + (Math.abs(left) < 4 ? left : left * 0.25);
      if (Math.abs(left) < 1 || el.scrollTop === before) { el.scrollTop = g.to; g.frame = 0; return; }
      g.frame = requestAnimationFrame(step);
    };
    g.frame = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(glide.current.frame), []);

  // ▲ ▼ scroll the text instead of moving the focus; Back is the system's (it leaves the app). Caught before the
  // app's own keys while the terms are up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const dir = e.key === "ArrowDown" || e.keyCode === 40 ? 1 : e.key === "ArrowUp" || e.keyCode === 38 ? -1 : 0;
      if (dir !== 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        scrollText(dir * SCROLL_STEP);
        return;
      }
      if (isBack(e)) { e.preventDefault(); e.stopImmediatePropagation(); exitApp(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!open) return null;
  const accept = () => {
    try { localStorage.setItem(KEY, String(TERMS_VERSION)); } catch { /* asked again next time */ }
    setOpen(false);
    // The wizard (first run) or the screen under it takes the focus back.
    setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const modals = document.querySelectorAll("[data-modal]");
      focusFirst((modals[modals.length - 1] as Element | undefined) ?? document);
    }, 0);
  };
  return (
    <div class="terms" data-modal ref={root} role="dialog" aria-label={t("wizTermsTitle")}>
      <div class="terms-col">
        <div class="terms-title">{t("wizTermsTitle")}</div>
        <div class="terms-text" ref={text}>
          {SECTIONS.map(([head, body]) => (
            <div key={body}>
              {head ? <div class="terms-head">{t(head)}</div> : null}
              <div class="terms-body">{t(body)}</div>
            </div>
          ))}
          <div class="terms-body terms-confirm">{t("wizTermsConfirm")}</div>
        </div>
        <div class="terms-buttons">
          <Button small id="terms-decline" text={t("wizTermsDecline")} onClick={exitApp} />
          <Button small id="terms-accept" text={t("wizTermsAccept")} onClick={accept} />
        </div>
      </div>
    </div>
  );
}
