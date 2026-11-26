import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { hashPin } from "@skmate/core";
import { Button, Drawer, focusFirst, Icon, isBack, Option, Popup, Presence, Segmented, Stepper, Toggle, type IconName } from "@skmate/ui";
import { applyLanguage, t, type Key } from "../i18n";
import { LANGUAGES, resolveLanguage } from "../i18n/languages";
import logo from "../assets/skmate-logo.png";
import { detectPlatform } from "../platform";
import { parseBackup, restoreBackup } from "../state/backup";
import { desktop, type CompanionPayload } from "../state/desktop";
import { setKids, setPinHash, type ProfileBook } from "../state/scope";
import { clampZoom, type Settings } from "../state/settings";
import { stalkerSource, xtreamUrl } from "../state/playlists";
import type { usePlaylists } from "../state/usePlaylists";
import { LinkDialog } from "./LinkDialog";
import { SourceForm } from "./SourceForm";
import { Ticks } from "./Spinner";
import { SyncDialog } from "./SyncDialog";
import { TextEntry } from "./TextEntry";
import { WelcomeTv } from "./WelcomeTv";
import "./wizard.css";

/** The terms of use come with the wizard (the host mounts both side by side). */
export { Terms } from "./Terms";

/*
 * The first-run wizard, ported from the Android app (features/setup): SetupWizard.kt (the steps), WizardFrame.kt (the
 * frame, buttons, cards, step numbers), SettingsStage.kt StageSettingRow / StageFieldRow (the rows, side = false).
 * Sizes are Android mpx, written 1:1 as px on the 1728×972 stage (wizard.css).
 */

export interface WizardResult {
  name: string | null; // null: the profile already exists (a redo from Settings)
  guest: boolean;
  /** The new profile is a kids profile, and its PIN (4-6 digits) or null (Android ProfileStep). */
  kids: boolean;
  pin: string | null;
  settings: Partial<Settings>;
  /** The playlist step adds to the app's playlists itself; "none" is all that is left for the host. */
  playlist: { kind: "url"; url: string } | { kind: "file"; name: string; text: string } | { kind: "demo" } | { kind: "none" };
}

/** The kids mark and the PIN the wizard asked for, put on the profile the host has just created. */
export function withWizardProfile(book: ProfileBook, r: WizardResult): ProfileBook {
  let b = book;
  if (r.kids) b = setKids(b, b.activeId, true);
  if (r.pin) b = setPinHash(b, b.activeId, hashPin(r.pin));
  return b;
}

type Playlists = Pick<ReturnType<typeof usePlaylists>, "store" | "active" | "channels" | "status" | "add" | "addFile" | "update" | "remove">;

/** Android `WizardStep`: what the numbers at the top right show. */
const STEPS: Key[] = ["wizStepLanguage", "wizStepDisplay", "wizStepProfile", "wizStepPlaylist", "wizStepReady"];
/** The pages, in Android's `Step` order (forward = slides in from the right). */
const PAGES = ["welcome", "display", "choice", "profile", "playlist", "remote", "type", "importing", "failed", "ready", "restoreFailed"] as const;
type Page = (typeof PAGES)[number];
const STEP_OF: Record<Page, number> = { welcome: 0, display: 1, choice: 2, profile: 2, playlist: 3, remote: 3, type: 3, importing: 3, failed: 3, ready: 4, restoreFailed: 2 };

/** The author's playlist (Android OwnTVApp.kt CoreBuildInfo.authorPlaylistUrl, core/setup/AuthorPlaylist.kt). */
const AUTHOR_URL = "https://nutrokstore.xyz/skmate/playlist.m3u8";
const AUTHOR_NAME = "SkMate";
/** Below this Android asks once before zooming out (UiZoom.LOW_RAM_WARN). */
const LOW_RAM_WARN = 85;
const THEMES: Array<Settings["theme"]> = ["system", "dark", "light"];

/** The language a first run starts in while it still follows the TV: the TV's own when the app has it, else Russian. */
export function firstRunLanguage(tag: string = typeof navigator !== "undefined" ? navigator.language : ""): Settings["language"] {
  const code = resolveLanguage(tag);
  return code === "en" ? "ru" : code; // "en" is also what an unsupported language resolves to; boxes are sold set to English
}

const LEFT = (e: KeyboardEvent) => e.key === "ArrowLeft" || e.keyCode === 37;
const RIGHT = (e: KeyboardEvent) => e.key === "ArrowRight" || e.keyCode === 39;

/** Unicons line glyphs (24 grid) the Android app draws before Phosphor (ui/components/UniconsIcons.kt). */
const UNICONS = {
  person: "M15.71,12.71a6,6,0,1,0-7.42,0,10,10,0,0,0-6.22,8.18,1,1,0,0,0,2,.22,8,8,0,0,1,15.9,0,1,1,0,0,0,1,.89h.11a1,1,0,0,0,.88-1.1A10,10,0,0,0,15.71,12.71ZM12,12a4,4,0,1,1,4-4A4,4,0,0,1,12,12Z",
  phone: "M12.71,16.29l-.15-.12a.76.76,0,0,0-.18-.09L12.2,16a1,1,0,0,0-.91.27,1.15,1.15,0,0,0-.21.33,1,1,0,0,0,1.3,1.31,1.46,1.46,0,0,0,.33-.22,1,1,0,0,0,.21-1.09A1,1,0,0,0,12.71,16.29ZM16,2H8A3,3,0,0,0,5,5V19a3,3,0,0,0,3,3h8a3,3,0,0,0,3-3V5A3,3,0,0,0,16,2Zm1,17a1,1,0,0,1-1,1H8a1,1,0,0,1-1-1V5A1,1,0,0,1,8,4h8a1,1,0,0,1,1,1Z",
  downloads: "M21,14a1,1,0,0,0-1,1v4a1,1,0,0,1-1,1H5a1,1,0,0,1-1-1V15a1,1,0,0,0-2,0v4a3,3,0,0,0,3,3H19a3,3,0,0,0,3-3V15A1,1,0,0,0,21,14Zm-9.71,1.71a1,1,0,0,0,.33.21.94.94,0,0,0,.76,0,1,1,0,0,0,.33-.21l4-4a1,1,0,0,0-1.42-1.42L13,12.59V3a1,1,0,0,0-2,0v9.59l-2.29-2.3a1,1,0,1,0-1.42,1.42Z",
  epg: "M12,19a1,1,0,1,0-1-1A1,1,0,0,0,12,19Zm5,0a1,1,0,1,0-1-1A1,1,0,0,0,17,19Zm0-4a1,1,0,1,0-1-1A1,1,0,0,0,17,15Zm-5,0a1,1,0,1,0-1-1A1,1,0,0,0,12,15ZM19,3H18V2a1,1,0,0,0-2,0V3H8V2A1,1,0,0,0,6,2V3H5A3,3,0,0,0,2,6V20a3,3,0,0,0,3,3H19a3,3,0,0,0,3-3V6A3,3,0,0,0,19,3Zm1,17a1,1,0,0,1-1,1H5a1,1,0,0,1-1-1V11H20ZM20,9H4V6A1,1,0,0,1,5,5H6V6A1,1,0,0,0,8,6V5h8V6a1,1,0,0,0,2,0V5h1a1,1,0,0,1,1,1ZM7,15a1,1,0,1,0-1-1A1,1,0,0,0,7,15Zm0,4a1,1,0,1,0-1-1A1,1,0,0,0,7,19Z",
  play_circle: "M16,10.27,11,7.38A2,2,0,0,0,8,9.11v5.78a2,2,0,0,0,1,1.73,2,2,0,0,0,2,0l5-2.89a2,2,0,0,0,0-3.46ZM15,12l-5,2.89V9.11L15,12ZM12,2A10,10,0,1,0,22,12,10,10,0,0,0,12,2Zm0,18a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z",
} as const;
type GlyphName = keyof typeof UNICONS | IconName;

/** An icon as Android draws it: the Unicons line glyph where the app has one, the shared Phosphor set otherwise. */
function Glyph({ name, size }: { name: GlyphName; size: number }) {
  if (name in UNICONS) {
    return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true"><path d={UNICONS[name as keyof typeof UNICONS]} /></svg>;
  }
  return <Icon name={name as IconName} size={size} />;
}

interface Props {
  settings: Settings;
  /** An existing viewer re-running the setup keeps their profile: the profile steps are left out. */
  hasProfile: boolean;
  /** The settings change on screen as the viewer chooses (theme, size, language), so the choice is seen at once. */
  onPreview: (s: Settings) => void;
  onFinish: (r: WizardResult) => void;
  onCancel?: () => void;
  /** The app's playlists: the playlist step adds to them at once and watches the import, as Android does. */
  playlists: Playlists;
  /** The guide is downloading / one is connected: the line of "Add a TV guide" on the last step. */
  guideLoading: boolean;
  guideAttached: boolean;
  /** "Add a TV guide": the wizard closes, then this opens Settings › TV guide. */
  onAddGuide: () => void;
}

/** One footer button (Android `WizardAction`): "back" has the arrow, "primary" the chevron. */
interface Action { id: string; label: string; onClick: () => void; kind: "back" | "extra" | "primary"; enabled?: boolean }

/**
 * The buttons under a step (WizardFrame.kt): one height and width, 14 apart; one light-grey bar behind them slides
 * to the focused one (200 ms) and fades in and out with the row's focus; entering the row it is put straight under it.
 */
function Buttons(p: { actions: Action[]; width?: number; trailing?: ComponentChildren }) {
  const each = p.width ?? (p.actions.length === 1 ? 520 : 260);
  const [at, setAt] = useState(0);
  const [inRow, setInRow] = useState(false);
  const [slide, setSlide] = useState(false);
  const inside = useRef(false);
  const row = useRef<HTMLDivElement>(null);
  const onFocus = (i: number) => {
    setSlide(inside.current); // moving inside the row slides; coming in from above snaps
    inside.current = true;
    setInRow(true);
    setAt(i);
  };
  const onBlur = () => setTimeout(() => {
    if (row.current && row.current.contains(document.activeElement)) return;
    inside.current = false;
    setInRow(false);
  }, 0);
  return (
    <div class="sw-buttons">
      <div class="sw-btn-row" ref={row}>
        <span class={`sw-btn-bar${slide ? " slide" : ""}`} style={{ width: `${each}px`, opacity: inRow ? 1 : 0, transform: `translateX(${at * (each + 14)}px)` }} />
        {p.actions.map((a, i) => {
          const enabled = a.enabled !== false;
          return (
            <button key={a.id} class={`sw-btn${a.kind === "primary" ? " primary" : ""}${enabled ? "" : " off"}`} style={{ width: `${each}px` }}
              data-focus={enabled ? a.id : undefined} tabIndex={enabled ? 0 : -1} aria-disabled={!enabled || undefined}
              onFocus={() => onFocus(i)} onBlur={onBlur} onClick={() => { if (enabled) a.onClick(); }}>
              {a.kind === "back" ? <Icon name="back" size={26} /> : null}
              <span class="sw-btn-label">{a.label}</span>
              {a.kind === "primary" ? <Icon name="chevron" size={20} /> : null}
            </button>
          );
        })}
      </div>
      {p.trailing}
    </div>
  );
}

/** A setting row (StageSettingRow, side = false): 84 high, icon 36, title 21/700, the line 15.5/500, the value right. */
function Row(p: { id: string; icon: GlyphName; title: string; line?: string; end?: ComponentChildren; onClick: () => void; onStep?: (d: number) => void }) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (!p.onStep) return;
    const d = LEFT(e) ? -1 : RIGHT(e) ? 1 : 0;
    if (d === 0) return;
    e.preventDefault();
    e.stopPropagation(); // the arrows change the value; the focus stays on the row
    p.onStep(d);
  };
  return (
    <button class="st-focusable sw-row" data-focus={p.id} onClick={p.onClick} onKeyDown={onKeyDown as never}>
      <span class="sw-row-icon"><Glyph name={p.icon} size={36} /></span>
      <span class="sw-row-body">
        <span class="sw-row-title">{p.title}</span>
        {p.line ? <span class="sw-row-line">{p.line}</span> : null}
      </span>
      {p.end !== undefined && p.end !== null ? <span class="sw-row-end">{p.end}</span> : null}
    </button>
  );
}

/**
 * A text field row (StageFieldRow, side = false): 90 high, the pencil, the label 21/700 and the value (or the dim
 * placeholder) 19 under it; "Edit" in blue while focused. OK opens the entry popup (the TV keyboard comes with it, at
 * the top of the screen); a secret row shows dots and ▶ shows or hides them.
 */
function Field(p: { id: string; label: string; value: string; placeholder: string; secret?: boolean; onDone: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const back = () => setTimeout(() => focusFirst(document, p.id), 0);
  const text = p.secret && !shown ? "•".repeat(p.value.length) : p.value;
  const onKeyDown = (e: KeyboardEvent) => {
    if (!p.secret || !RIGHT(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setShown((s) => !s);
  };
  return (
    <>
      <button class={`st-focusable sw-row sw-field${open ? " st-lit" : ""}`} data-focus={p.id} onClick={() => setOpen(true)} onKeyDown={onKeyDown as never}>
        <span class="sw-field-icon"><Icon name="edit" size={32} /></span>
        <span class="sw-row-body">
          <span class="sw-row-title">{p.label}</span>
          <span class={p.value ? "sw-field-value" : "sw-field-ph"}>{p.value ? text : p.placeholder}</span>
        </span>
        <span class="sw-field-edit">{t("wizEdit")}</span>
      </button>
      <Presence show={open}>
        {(out) => (
          <TextEntry title={p.label} hint={t("wizFieldHelp")} label={p.label} value={p.value} closing={out} type={p.secret ? "password" : "text"}
            onDone={(v) => { setOpen(false); back(); p.onDone(v); }}
            onCancel={() => { setOpen(false); back(); }} />
        )}
      </Presence>
    </>
  );
}

/** One choice card (`.tile2`, WizardCards): icon 38, title 23/800, two lines of 16 at most; focus = the grey plate. */
interface Card { id: string; icon: GlyphName; title: string; line: string; onClick: () => void }
function Cards({ cards }: { cards: Card[] }) {
  return (
    <div class="sw-cards">
      {cards.map((c) => (
        <button key={c.id} class="st-focusable sw-card" data-focus={c.id} onClick={c.onClick}>
          <span class="sw-card-icon"><Glyph name={c.icon} size={38} /></span>
          <span class="sw-card-title">{c.title}</span>
          <span class="sw-card-line">{c.line}</span>
        </button>
      ))}
    </div>
  );
}

/** The numbered steps at the top right: done and current in SkMate blue, the current one named, later ones grey rings. */
function StepNumbers({ current }: { current: number }) {
  return (
    <div class="sw-steps">
      {STEPS.map((k, i) => (
        <div key={k} class={`sw-step${i <= current ? " on" : ""}`}>
          {i > 0 ? <span class="sw-step-line" /> : null}
          <span class="sw-step-num">{i + 1}</span>
          {i === current ? <span class="sw-step-name" key={`n${current}`}>{t(k)}</span> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * The first run, as in the Android app: Welcome (language) → Display size → (Setup choice) → Who's watching? → Add a
 * playlist → Importing → All set. Every step is the same frame: the SKMATE logo and the step numbers on top, the
 * centred column (title, line, rows or cards, buttons) in the middle of the screen.
 */
export function Wizard(p: Props) {
  const pl = p.playlists;
  // Restoring a backup reads a file (a browser, the Windows app); a sync talks to another SkMate (the Windows app). A
  // TV's own browser can do neither, so there the setup choice would offer one card only and is left out.
  const canPickFile = detectPlatform() === "browser";
  const app = desktop();
  const hasChoice = !p.hasProfile && (canPickFile || !!app);
  const [page, setPage] = useState<Page>("welcome");
  const [forward, setForward] = useState(true);
  const [s, setS] = useState<Settings>(p.settings);
  // Who's watching (Android ProfileStep): a name filled in already, so the viewer can just go on.
  const [name, setName] = useState(() => t("wizGuest"));
  const [nameTouched, setNameTouched] = useState(false);
  const [kids, setKidsOn] = useState(false);
  const [pin, setPin] = useState("");
  const [sample, setSample] = useState(true);
  const [lowZoomOk, setLowZoomOk] = useState(p.settings.uiScale < LOW_RAM_WARN);
  const [askLowZoom, setAskLowZoom] = useState<Settings["uiScale"] | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  // The import in progress: which link, under what name, and the page Back and Try again return to.
  const [importing, setImporting] = useState<{ url: string | null; name: string | null; origin: Page } | null>(null);
  // The channel list when the import began: a new list (even an empty one) is the import's answer.
  const startChannels = useRef<unknown>(null);
  const [failure, setFailure] = useState("");
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  const change = (next: Settings) => {
    setS(next);
    p.onPreview(next);
    applyLanguage(next.language);
  };
  const go = (to: Page) => {
    setForward(PAGES.indexOf(to) >= PAGES.indexOf(page));
    setPage(to);
  };

  // The name follows the language until the viewer types one ("Гость" / "Guest").
  useEffect(() => { if (!nameTouched) setName(t("wizGuest")); }, [s.language]);
  // A first run starts in the TV's language, or Russian (Android FirstRunLanguageGlobe / firstRunLanguage()).
  useEffect(() => { if (s.language === "auto") change({ ...s, language: firstRunLanguage() }); }, []);

  // The first control of each step takes the focus once it is on screen (Android rememberFirstFocus, 60 ms).
  const FIRST: Record<Page, string | undefined> = {
    welcome: "sw-next", display: "sw-zoom", choice: "sw-card-profile", profile: "sw-name", playlist: undefined, remote: undefined,
    type: undefined, importing: "sw-next", failed: "sw-next", ready: "sw-next", restoreFailed: "sw-next",
  };
  useEffect(() => {
    const id = setTimeout(() => {
      const box = root.current?.querySelector(".sw-col");
      if (box) focusFirst(box, FIRST[page]);
    }, 60);
    return () => clearTimeout(id);
  }, [page]);

  // While the wizard is up nothing under it takes the focus: a playlist that arrives during the import would otherwise
  // put the cursor on its first channel (and start its preview behind the wizard, on the TV's one video decoder).
  // Dialogs over the wizard (the keyboard popup, a side panel) are their own `[data-modal]` and keep theirs.
  useEffect(() => {
    const guard = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      const box = root.current;
      if (!el || !box || !(el instanceof HTMLElement)) return;
      if (box.contains(el)) { lastFocus.current = el; return; }
      const modal = el.closest("[data-modal]");
      if (modal && modal !== box) return;
      e.stopImmediatePropagation(); // the screen under the wizard never hears of it
      setTimeout(() => {
        const back = lastFocus.current && lastFocus.current.isConnected ? lastFocus.current : null;
        if (back) back.focus(); else focusFirst(box.querySelector(".sw-col") ?? box);
      }, 0);
    };
    document.addEventListener("focus", guard, true);
    document.documentElement.classList.add("sw-open");
    return () => {
      document.removeEventListener("focus", guard, true);
      document.documentElement.classList.remove("sw-open");
    };
  }, []);

  const finish = () => {
    p.onFinish({
      name: p.hasProfile ? null : name.trim() || t("wizGuest"),
      guest: false,
      kids: !p.hasProfile && kids,
      pin: !p.hasProfile && pin.length >= 4 ? pin : null,
      settings: { language: s.language, theme: s.theme, uiScale: s.uiScale },
      playlist: { kind: "none" },
    });
  };

  // Back on the remote, step by step (Android: each frame's Back button, or none).
  const backOf: Record<Page, (() => void) | null> = {
    welcome: p.onCancel ?? null,
    display: () => go("welcome"),
    choice: () => go("display"),
    profile: () => go(hasChoice ? "choice" : "display"),
    playlist: null, // Back does not skip: skipping is a choice made with OK
    remote: () => go("playlist"),
    type: () => go("playlist"),
    importing: () => cancelImport(),
    failed: () => cancelImport(),
    ready: () => finish(),
    restoreFailed: () => go(hasChoice ? "choice" : "playlist"),
  };
  const backRef = useRef(backOf[page]);
  backRef.current = backOf[page];
  // The language panel and the low-zoom question live inside the wizard: Back closes them first.
  const overlayBack = useRef<() => void>(() => undefined);
  overlayBack.current = () => {
    if (askLowZoom !== null) { setAskLowZoom(null); setTimeout(() => focusFirst(document, "sw-zoom"), 0); } else if (langOpen) setLangOpen(false);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isBack(e)) return;
      const modals = document.querySelectorAll("[data-modal]");
      const top = modals[modals.length - 1];
      const box = root.current;
      if (!box || !top || !(top === box || box.contains(top))) return; // a popup over the wizard (typing) takes Back itself
      if (document.activeElement instanceof HTMLInputElement && e.key === "Backspace") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (top === box) backRef.current?.(); else overlayBack.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);
  // Closed (a redo from the settings): the focus goes to the screen under it, never nowhere.
  useEffect(() => () => {
    setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      document.querySelector<HTMLElement>(".content [data-focus]:not(input)")?.focus();
    }, 0);
  }, []);

  // ----- Display size -----
  const setZoom = (z: Settings["uiScale"]) => change({ ...s, uiScale: z });
  // Android UiZoom: 50–150 % in steps of 5, the same as Settings › Внешний вид › Масштаб интерфейса.
  const stepZoom = (d: number) => {
    const next = clampZoom(clampZoom(s.uiScale) + d * 5);
    if (next === s.uiScale) return;
    if (d < 0 && next < LOW_RAM_WARN && !lowZoomOk) setAskLowZoom(next); else setZoom(next);
  };
  const themeAt = Math.max(0, THEMES.indexOf(s.theme));
  const setTheme = (i: number) => change({ ...s, theme: THEMES[i] as Settings["theme"] });

  // ----- Playlist and import -----
  const target = importing ? pl.store.list.find((x) => x.url === importing.url) ?? null : null;
  const startImport = (url: string | null, nm: string | null, origin: Page) => {
    startChannels.current = pl.channels;
    setImporting({ url, name: nm, origin });
    go("importing");
  };
  const addLink = (link: string, origin: Page, nm: string | null = null): string | null => {
    const err = pl.add(link);
    if (err) return err;
    startImport(link, nm, origin);
    return null;
  };
  const addAuthor = () => {
    const err = pl.add(AUTHOR_URL);
    if (err) { setFailure(err); setImporting({ url: AUTHOR_URL, name: AUTHOR_NAME, origin: "playlist" }); go("failed"); return; }
    startImport(AUTHOR_URL, AUTHOR_NAME, "playlist");
  };
  // The author's playlist is called "SkMate" (Android AuthorPlaylist.NAME), not after its address.
  useEffect(() => {
    const own = pl.store.list.find((x) => x.url === AUTHOR_URL);
    if (own && own.name !== AUTHOR_NAME && importing?.url === AUTHOR_URL) pl.update(own.id, AUTHOR_NAME, AUTHOR_URL);
  }, [pl.store.list, importing?.url]);
  // Where the import is: the list loading, then its channels (All set) or the reason it failed.
  useEffect(() => {
    if (!importing || page !== "importing") return;
    const mine = !!target && pl.active?.id === target.id;
    if (!mine) return;
    if (pl.status.kind === "loading") return;
    if (pl.status.kind === "error") { setFailure(pl.status.message); go("failed"); return; }
    if (pl.channels === startChannels.current) return; // still the list from before
    if (pl.channels.length > 0) go("ready");
    else { setFailure(t("wizNotPlaylist")); go("failed"); }
  }, [page, importing, target?.id, pl.active?.id, pl.status, pl.channels]);
  // Cancel, Back and Try again: the half-done playlist goes, and the step the import came from comes back.
  const cancelImport = () => {
    if (target) pl.remove(target.id);
    const origin = importing?.origin ?? "playlist";
    setImporting(null);
    go(origin);
  };
  // A playlist sent from a phone (the Windows app's companion page), as Settings › Playlists takes it.
  const takeRemote = async (x: CompanionPayload) => {
    let err: string | null;
    if (x.type === "m3u" && x.playlistContent.trim()) {
      const before = new Set(pl.store.list.map((e) => e.url));
      err = await pl.addFile(x.playlistFileName || x.name || "playlist.m3u", x.playlistContent);
      if (!err) { setRemoteError(null); fileUrls.current = before; startImport(null, x.name || null, "playlist"); }
    } else if (x.type === "m3u") err = addLink(x.server, "playlist", x.name || null);
    else {
      const link = x.type === "xtream" ? xtreamUrl(x.server, x.user, x.pass) : stalkerSource(x.portalUrl, x.mac);
      err = link ? addLink(link, "playlist", x.name || null) : t(x.type === "xtream" ? "xtBad" : "stkMacBad");
    }
    setRemoteError(err);
  };
  // A playlist from a file gets a local address chosen by the store: the new entry is the one that was not there before.
  const fileUrls = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!importing || importing.url !== null || !fileUrls.current) return;
    const added = pl.store.list.find((e) => !fileUrls.current?.has(e.url));
    if (added) { fileUrls.current = null; setImporting({ ...importing, url: added.url, name: importing.name ?? added.name }); }
  }, [pl.store.list, importing]);
  const addFile = async (fileName: string, text: string): Promise<string | null> => {
    const before = new Set(pl.store.list.map((e) => e.url));
    const err = await pl.addFile(fileName, text);
    if (err) return err;
    fileUrls.current = before;
    startImport(null, null, "type");
    return null;
  };
  // Restore a backup (a browser or the Windows app): what the file holds replaces this TV's, then a clean start.
  const pickBackup = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const backup = parseBackup(await file.text());
    if (!backup) { setFailure(t("bkBad")); go("restoreFailed"); return; }
    restoreBackup(backup, localStorage);
    location.reload();
  };

  // ----- The steps -----
  let title = "";
  let sub: string | null = null;
  let body: ComponentChildren = null;
  let actions: Action[] = [];
  let buttonWidth: number | undefined;
  const back = (onClick: () => void): Action => ({ id: "sw-back", label: t("wizBack"), onClick, kind: "back" });

  if (page === "welcome") {
    title = t("wizWelcome");
    actions = [{ id: "sw-next", label: t("wizGetStarted"), onClick: () => go("display"), kind: "primary" }];
  } else if (page === "display") {
    title = t("wizDisplayTitle");
    sub = t("wizDisplaySub");
    body = (
      <>
        <Row id="sw-zoom" icon="zoom" title={t("wizZoom")} line={t("wizZoomLine")} end={<Stepper value={t("wizPercent", { n: s.uiScale })} onStep={stepZoom} />}
          onClick={() => stepZoom(1)} onStep={stepZoom} />
        <Row id="sw-theme" icon="theme" title={t("wizTheme")} line={t("wizThemeLine")}
          end={<Segmented options={[t("wizThemeSystem"), t("wizThemeDark"), t("wizThemeLight")]} selected={themeAt} onPick={setTheme} />}
          onClick={() => setTheme((themeAt + 1) % THEMES.length)} onStep={(d) => setTheme(Math.max(0, Math.min(THEMES.length - 1, themeAt + d)))} />
        <Row id="sw-sample" icon="play_circle" title={t("wizSampleTitle")} line={t("wizSampleLine")} end={<Toggle on={sample} />} onClick={() => setSample((v) => !v)} />
      </>
    );
    actions = [
      back(() => go("welcome")),
      { id: "sw-reset", label: t("wizReset"), onClick: () => change({ ...s, uiScale: 100, theme: "system" }), kind: "extra" },
      { id: "sw-next", label: t("wizContinue"), onClick: () => go(p.hasProfile ? "playlist" : hasChoice ? "choice" : "profile"), kind: "primary" },
    ];
  } else if (page === "choice") {
    title = t("wizChoiceTitle");
    sub = t("wizChoiceSub");
    body = (
      <Cards cards={[
        { id: "sw-card-profile", icon: "person", title: t("wizNewProfile"), line: t("wizNewProfileLine"), onClick: () => go("profile") },
        ...(canPickFile ? [{ id: "sw-card-restore", icon: "downloads" as const, title: t("wizRestore"), line: t("wizRestoreLine"), onClick: () => fileInput.current?.click() }] : []),
        ...(app ? [{ id: "sw-card-sync", icon: "phone" as const, title: t("wizSyncDevice"), line: t("wizSyncDeviceLine"), onClick: () => setSyncOpen(true) }] : []),
      ]} />
    );
    actions = [back(() => go("display"))];
  } else if (page === "profile") {
    title = t("wizProfileTitle");
    sub = t("wizProfileSub");
    const valid = name.trim() !== "" && (pin === "" || pin.length >= 4);
    body = (
      <>
        <Field id="sw-name" label={t("wizName")} value={name} placeholder={t("wizNameHint")} onDone={(v) => { setName(v); setNameTouched(true); }} />
        <Row id="sw-kids" icon="favorite" title={t("wizKids")} line={t("wizKidsLine")} end={<Toggle on={kids} />} onClick={() => setKidsOn((v) => !v)} />
        <Field id="sw-pin" label={t("wizPin")} value={pin} placeholder={t("wizPinHint")} secret onDone={(v) => setPin(v.replace(/\D/g, "").slice(0, 6))} />
      </>
    );
    actions = [
      back(() => go(hasChoice ? "choice" : "display")),
      { id: "sw-next", label: t("wizCreateProfile"), onClick: () => { if (valid) go("playlist"); }, kind: "primary", enabled: valid },
    ];
  } else if (page === "playlist") {
    title = t("wizPlaylistTitle");
    sub = t("wizPlaylistSub");
    body = (
      <Cards cards={[
        { id: "sw-card-author", icon: "playlist", title: t("wizAuthor"), line: t("wizAuthorLine"), onClick: addAuthor },
        ...(app ? [{ id: "sw-card-remote", icon: "phone" as const, title: t("wizRemote"), line: t("wizRemoteLine"), onClick: () => { setRemoteError(null); go("remote"); } }] : []),
        { id: "sw-card-type", icon: "edit", title: t("wizTypeHere"), line: t("wizTypeHereLine"), onClick: () => go("type") },
        ...(canPickFile ? [{ id: "sw-card-import", icon: "downloads" as const, title: t("wizImport"), line: t("wizImportLine"), onClick: () => fileInput.current?.click() }] : []),
      ]} />
    );
    actions = [{ id: "sw-skip", label: t("wizSkip"), onClick: finish, kind: "back" }];
    buttonWidth = 1040; // Skip runs the width of the cards above it
  } else if (page === "importing") {
    const nm = importing?.name ?? target?.name ?? null;
    title = nm ? t("wizImporting", { name: nm }) : t("wizImportingCatalog");
    sub = t("wizImportingSub");
    body = (
      <div class="sw-progress" role="status">
        <span class="sw-spin"><Ticks /></span>
        <span class="sw-progress-text">{t("wizPreparing")}</span>
      </div>
    );
    actions = [
      { id: "sw-back", label: t("wizCancel"), onClick: cancelImport, kind: "back" },
      // Into the app at once; the list keeps loading there.
      { id: "sw-next", label: t("wizBackground"), onClick: finish, kind: "primary" },
    ];
  } else if (page === "failed") {
    title = t("wizImportFailed");
    sub = failure;
    actions = [back(cancelImport), { id: "sw-next", label: t("wizTryAgain"), onClick: cancelImport, kind: "primary" }];
  } else if (page === "restoreFailed") {
    title = t("wizRestoreFailed");
    sub = failure;
    actions = [{ id: "sw-next", label: t("wizBack"), onClick: () => go(hasChoice ? "choice" : "playlist"), kind: "primary" }];
  } else if (page === "ready") {
    title = t("wizAllSet");
    sub = t("wizSynced", { counts: t("channelsCount", { n: pl.channels.length.toLocaleString(document.documentElement.lang || undefined) }) });
    body = (
      <Row id="sw-guide" icon="epg" title={t("wizAddGuide")}
        line={t(p.guideLoading ? "wizGuideLoading" : p.guideAttached ? "wizGuideAttached" : "wizAddGuideLine")}
        end={<span class="sw-chevron"><Icon name="chevron" size={20} /></span>}
        onClick={() => { finish(); setTimeout(p.onAddGuide, 0); }} />
    );
    actions = [{ id: "sw-next", label: t("wizContinue"), onClick: finish, kind: "primary" }];
  }

  // The welcome button runs the title's width, less the globe beside it (Android matchTitleWidth).
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [titleW, setTitleW] = useState(0);
  useLayoutEffect(() => { if (page === "welcome") setTitleW(titleRef.current?.offsetWidth ?? 0); }, [page, title]);
  if (page === "welcome") buttonWidth = Math.max(260, titleW - 76 - 14);

  const langChoices: Array<{ value: Settings["language"]; title: string; line?: string }> = [
    { value: "auto", title: t("wizLangSystem"), line: t("wizLangSystemLine") },
    ...LANGUAGES.map((l) => ({ value: l.code as Settings["language"], title: l.name })),
  ];

  return (
    <div class="setup-wizard" data-modal ref={root}>
      <img class="sw-logo" src={logo} alt="skmate" />
      <StepNumbers current={STEP_OF[page]} />

      {page === "remote" && app ? (
        <LinkDialog mode="add" title={t("wizRemote")} hints={[t("wizRemoteHint")]} onClose={() => go("playlist")}
          onEvent={(e) => { if (e.kind === "payload") void takeRemote(e.payload); }}>
          {remoteError ? <div class="status error" style={{ textAlign: "center" }}>{remoteError}</div> : null}
        </LinkDialog>
      ) : null}

      <div class="sw-stage">
        {page === "type" ? (
          // Type it here (Android AddSourceScreen in a StageFormPage): the path line, then the source form.
          <div class={`sw-col sw-form ${forward ? "fwd" : "bwd"}`} key={page}>
            <div class="sw-path"><span class="sw-path-parent">{t("wizAddSource")}</span><span class="sw-path-sep">›</span><span>{t("wizTypeHere")}</span></div>
            <div class="sw-form-body">
              <SourceForm idPrefix="sw" onSubmit={(link) => addLink(link, "type")} onFile={addFile} />
            </div>
          </div>
        ) : (
          <div class={`sw-col ${forward ? "fwd" : "bwd"}`} key={page}>
            {page === "welcome" ? <div class="sw-tv"><WelcomeTv /></div> : null}
            <h1 class={`sw-title${page === "welcome" ? " big" : ""}`} ref={titleRef}>{title}</h1>
            {sub ? <p class="sw-sub">{sub}</p> : null}
            {body ? <div class="sw-body">{body}</div> : null}
            {actions.length > 0 ? (
              <Buttons actions={actions} width={buttonWidth} trailing={page === "welcome" ? (
                <button class="st-focusable sw-globe" data-focus="sw-lang" aria-label={t("wizStepLanguage")} onClick={() => setLangOpen(true)}>
                  <Icon name="language" size={38} />
                </button>
              ) : undefined} />
            ) : null}
          </div>
        )}
      </div>

      <input ref={fileInput} type="file" accept="application/json,.json" style={{ display: "none" }}
        onChange={(e) => void pickBackup(e.currentTarget as HTMLInputElement)} />
      {syncOpen ? <SyncDialog onClose={() => setSyncOpen(false)} /> : null}

      {/* The language list (Android FirstRunLanguagePopup, a StageSidePanel): OK picks and closes. */}
      <Presence show={langOpen} ms={240}>
        {(out) => (
          <Drawer variant="panel" title={t("wizStepLanguage")} label={t("wizStepLanguage")} closing={out} returnFocus onClose={() => setLangOpen(false)}>
            <LangList choices={langChoices} value={s.language} onPick={(language) => { change({ ...s, language }); setLangOpen(false); }} />
          </Drawer>
        )}
      </Presence>

      {/* Zooming below 85 % the first time (Android StageConfirm, focus on Cancel). */}
      {askLowZoom !== null ? (
        <Popup width={760} title={t("wizLowZoomTitle")} body={t("wizLowZoomBody", { n: LOW_RAM_WARN })}
          onClose={() => { setAskLowZoom(null); setTimeout(() => focusFirst(document, "sw-zoom"), 0); }}
          buttons={(
            <>
              <Button small id="sw-lowzoom-cancel" text={t("wizCancel")} onClick={() => { setAskLowZoom(null); setTimeout(() => focusFirst(document, "sw-zoom"), 0); }} />
              <Button small id="sw-lowzoom-ok" text={t("wizLowZoomAccept")} onClick={() => {
                setLowZoomOk(true); setZoom(askLowZoom); setAskLowZoom(null); setTimeout(() => focusFirst(document, "sw-zoom"), 0);
              }} />
            </>
          )}>
          <LowZoomFocus />
        </Popup>
      ) : null}
    </div>
  );
}

/** The low-zoom question opens with the focus on Cancel. */
function LowZoomFocus() {
  useEffect(() => { const id = setTimeout(() => focusFirst(document, "sw-lowzoom-cancel"), 0); return () => clearTimeout(id); }, []);
  return null;
}

/** The languages in the side panel, the chosen one ticked and focused first (Android SidePanelLanguageRow). */
function LangList(p: { choices: Array<{ value: Settings["language"]; title: string; line?: string }>; value: Settings["language"]; onPick: (v: Settings["language"]) => void }) {
  useEffect(() => { const id = setTimeout(() => focusFirst(document, `sw-lang-${p.value}`), 80); return () => clearTimeout(id); }, []);
  return (
    <div class="st-panel-body">
      {p.choices.map((c) => (
        <Option key={c.value} id={`sw-lang-${c.value}`} title={c.title} subtitle={c.line} checked={c.value === p.value} onClick={() => p.onPick(c.value)} />
      ))}
    </div>
  );
}
