import type { ComponentChildren } from "preact";
import { createContext } from "preact";
import { createPortal } from "preact/compat";
import { useContext, useEffect, useRef } from "preact/hooks";
import { focusFirst, isBack } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { SET_ICONS } from "./settingsIcons";

/*
 * The Android settings sheet's building blocks (SettingsStage.kt, side mode), on the st-* classes of packages/ui:
 * a row (`StageSettingRow`: icon 38, title 26/600, the value or a short line 20/500 under it, a switch or a stepper on
 * the right), a heading (24/800), a note, an info card, and the editors that open over the rows in the same sheet
 * (`PanelChoices`, `PanelStepper`, `PanelSwitches`). Sizes are Android mpx, written as px of the 1728×972 stage.
 */

const cls = (...p: Array<string | false | null | undefined>) => p.filter(Boolean).join(" ");

/** An `OwnTVIcon` as Android draws it: Unicons Line where it has the glyph, else Phosphor regular. */
export function SIcon({ name, size }: { name: string; size: number }) {
  const g = SET_ICONS[name] ?? SET_ICONS.INFO!;
  return (
    <svg viewBox={`0 0 ${g[0]} ${g[0]}`} width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d={g[1]} />
    </svg>
  );
}

/** Android plurals: the `_one` / `_few` / `_many` / `_other` keys of one string, chosen for [n] in the app's language. */
export function pl(base: string, n: number): string {
  const lang = (typeof document !== "undefined" && document.documentElement.lang) || "en";
  let cat = "other";
  try {
    const I = (Intl as unknown as { PluralRules?: new (l: string) => { select: (n: number) => string } }).PluralRules;
    if (I) cat = new I(lang).select(n);
    else throw new Error("no PluralRules");
  } catch {
    // Chromium 53 (webOS 4) has no Intl.PluralRules: the Slavic rule for Russian and Polish, one/other elsewhere.
    const m10 = n % 10, m100 = n % 100;
    const few = m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14);
    if (lang === "ru") cat = m10 === 1 && m100 !== 11 ? "one" : few ? "few" : "many";
    else if (lang === "pl") cat = n === 1 ? "one" : few ? "few" : "many";
    else cat = n === 1 ? "one" : "other";
  }
  const key = (c: string) => `${base}_${c}` as Key;
  const pick = ["zero", "two"].includes(cat) ? "other" : cat;
  return t(key(pick), { 1: n, n });
}

/** `%1$s`-style values filled in: [args] in order. */
export function tf(key: Key, ...args: Array<string | number>): string {
  const vars: Record<string, string | number> = {};
  args.forEach((a, i) => { vars[String(i + 1)] = a; });
  return t(key, vars);
}

/** Text that does not fit scrolls while its row is focused (Android `basicMarquee`: 900 ms before it starts, endless). */
function startMarquee(row: HTMLElement): void {
  row.querySelectorAll<HTMLElement>(".set-mq").forEach((box) => {
    const inner = box.firstElementChild as HTMLElement | null;
    const over = box.scrollWidth - box.clientWidth;
    if (!inner || over <= 1 || typeof inner.animate !== "function") return;
    box.classList.add("run");
    const travel = over + 24;
    const move = (travel / 60) * 1000; // about 60 px a second, as Android's default marquee speed on a 1080p TV
    const pause = 900;
    const all = pause + move + pause;
    const anim = inner.animate(
      [
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: pause / all },
        { transform: `translateX(${-travel}px)`, offset: (pause + move) / all },
        { transform: `translateX(${-travel}px)`, offset: 1 },
      ],
      { duration: all, iterations: Infinity },
    );
    (inner as unknown as { _mq?: Animation })._mq = anim;
  });
}

function stopMarquee(row: HTMLElement): void {
  row.querySelectorAll<HTMLElement>(".set-mq").forEach((box) => {
    box.classList.remove("run");
    const inner = box.firstElementChild as (HTMLElement & { _mq?: Animation }) | null;
    if (inner?._mq) { inner._mq.cancel(); inner._mq = undefined; }
  });
}

/** One line of text that ellipsizes at rest and scrolls while focused. */
export function Mq({ cls: c, children }: { cls: string; children: ComponentChildren }) {
  return <span class={`${c} set-mq`}><span class="set-mq-in">{children}</span></span>;
}

const HOLD_MS = 600;

export interface RowProps {
  id: string;
  icon: string;
  title: string;
  /** The line under the title: the current value (Choice, Opens, Segmented, Action) or the short description. */
  line?: string;
  /** On the right: a switch, a stepper, tags, a swatch. */
  end?: ComponentChildren;
  disabled?: boolean;
  /** The small accent dot after the title: also pinned to Quick. */
  pinned?: boolean;
  /** The row whose choices are open over the rows: the 7% wash. */
  marked?: boolean;
  onOk?: () => void;
  /** ◀ ▶ on a stepper or segmented row. */
  onStep?: (d: number) => void;
  /** Hold OK (Android onLongClick): the pin menu, or a profile's delete question. */
  onHold?: () => void;
  className?: string;
}

/**
 * `StageSettingRow` in the sheet: min 92 high, 30 from each edge, icon 38 muted, title 26/600, line 20/500. OK runs on
 * release so that a held OK can be told from a press (Android: a release within 800 ms of a long press does not click).
 */
export function SRow(p: RowProps) {
  const held = useRef<{ timer: number; fired: boolean } | null>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.keyCode === 13) {
      e.preventDefault();
      if (e.repeat || held.current) return;
      const h = { timer: 0, fired: false };
      held.current = h;
      if (p.onHold) h.timer = window.setTimeout(() => { h.fired = true; p.onHold?.(); }, HOLD_MS);
      return;
    }
    const d = e.key === "ArrowLeft" || e.keyCode === 37 ? -1 : e.key === "ArrowRight" || e.keyCode === 39 ? 1 : 0;
    if (d !== 0 && p.onStep) {
      e.preventDefault();
      e.stopPropagation();
      if (!p.disabled) p.onStep(d);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!(e.key === "Enter" || e.keyCode === 13)) return;
    const h = held.current;
    held.current = null;
    if (!h) return;
    clearTimeout(h.timer);
    if (!h.fired && !p.disabled) p.onOk?.();
  };
  return (
    <button
      class={cls("st-focusable st-setting set-row", p.disabled && "off", p.marked && "marked", p.className)}
      data-focus={p.id} aria-disabled={p.disabled || undefined}
      onClick={(e) => { if ((e as MouseEvent).detail !== 0 && !p.disabled) p.onOk?.(); }}
      onKeyDown={onKeyDown as never} onKeyUp={onKeyUp as never}
      onFocus={(e) => startMarquee(e.currentTarget as HTMLElement)}
      onBlur={(e) => { held.current = null; stopMarquee(e.currentTarget as HTMLElement); }}
    >
      <span class="st-setting-icon"><SIcon name={p.icon} size={38} /></span>
      <span class="st-setting-body">
        <span class="set-title-line">
          <Mq cls="st-setting-title">{p.title}</Mq>
          {p.pinned ? <i class="set-pin" /> : null}
        </span>
        {p.line ? <Mq cls="st-setting-value">{p.line}</Mq> : null}
      </span>
      {p.end !== undefined && p.end !== null && p.end !== false ? <span class="st-setting-end">{p.end}</span> : null}
    </button>
  );
}

/** `StageSettingsHeading`: 24/800, 22 from the edge, 6 above the page's first one and 26 above the others. */
export function SHeading({ text, first }: { text: string; first?: boolean }) {
  return <div class={cls("st-section", first && "first")}>{text}</div>;
}

/** `StageSettingsNote`: what an empty page says. */
export function SNote({ title, body }: { title: string; body?: string }) {
  return (
    <div class="set-note-box">
      <div class="set-note-title">{title}</div>
      {body ? <div class="set-note-body">{body}</div> : null}
    </div>
  );
}

/** `StageInfoCard`: the Backup / Sync / About cards. [plain] = no idle fill. Without [onOk] it is only read. */
export function InfoCard(p: {
  id?: string; title: string; label?: string; body?: string; icon?: string; lead?: ComponentChildren; plain?: boolean; onOk?: () => void; iconSize?: number;
}) {
  const inner = (
    <>
      {p.lead ?? (p.icon ? <span class="set-card-icon"><SIcon name={p.icon} size={p.iconSize ?? 34} /></span> : null)}
      <span class="set-card-text">
        <span class="set-card-title">{p.title}</span>
        {p.label ? <span class="set-card-label">{p.label}</span> : null}
        {p.body ? <span class="set-card-body">{p.body}</span> : null}
      </span>
    </>
  );
  if (!p.onOk) return <div class={cls("set-card", p.plain && "plain")}>{inner}</div>;
  return <button class={cls("st-focusable set-card", p.plain && "plain")} data-focus={p.id} onClick={p.onOk}>{inner}</button>;
}

/** A tag (`StageTag`); [tint] = the outlined accent one. */
export function Tag({ text, tint }: { text: string; tint?: boolean }) {
  return <span class={cls("st-tag", tint && "tint set-tag-blue")}>{text}</span>;
}

// ---------------------------------------------------------------------------------------------------------------
// The editors that open over the rows (SettingsStage.kt SettingPanelEditor)
// ---------------------------------------------------------------------------------------------------------------

/** What the sheet offers its pages (provided by SettingsSheet). */
export interface SheetApi {
  /** Closes the choice list or stepper open over the rows; the focus goes back to its row. */
  closeEditor: () => void;
  /** Focus the control with this data-focus id (after a page or an editor closed). */
  focus: (id: string) => void;
  /** Where editors are drawn: over the rows, under the sheet's title. */
  slot: HTMLElement | null;
  /** A page's own Back step (an editor it opened): the latest one wins over the sheet's. Returns its removal. */
  pushBack: (fn: () => void) => () => void;
  /** Where popups opened from the sheet go: after the sheet in the same box, so they are always the topmost dialog. */
  dialogs: HTMLElement | null;
}

export const SheetCtx = createContext<SheetApi>({ closeEditor: () => undefined, focus: () => undefined, slot: null, pushBack: () => () => undefined, dialogs: null });
export const useSheet = () => useContext(SheetCtx);

/**
 * A popup over the sheet. Inside Settings it is drawn after the sheet in the sheet's own box (a portal to the end of
 * #app could land before the sheet when the app re-renders, and the remote's focus would stay in the sheet). Outside
 * Settings: in place, or at the end of #app with [app].
 */
export function OverSheet(p: { children: ComponentChildren; app?: boolean }) {
  const { dialogs } = useSheet();
  if (dialogs) return createPortal(<>{p.children}</>, dialogs);
  if (p.app) return createPortal(<>{p.children}</>, document.getElementById("app") ?? document.body);
  return <>{p.children}</>;
}

/** Back inside the sheet goes to [fn] while [active] (a page's own editor), before the sheet's own step. */
export function useSheetBack(active: boolean, fn: () => void): void {
  const sheet = useSheet();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => (active ? sheet.pushBack(() => ref.current()) : undefined), [active]);
}

/** The editor overlay: over the rows, in the sheet's own fill; focus cannot leave it (data-modal). */
export function EditorLayer({ title, children }: { title: string; children: ComponentChildren }) {
  const { slot } = useSheet();
  const layer = (
    <div class="set-editor" data-modal>
      <div class="set-editor-title">{title}</div>
      {children}
    </div>
  );
  return slot ? createPortal(layer, slot) : layer;
}

export interface Choice<T> { value: T; label: string; desc?: string; recommended?: boolean }

/**
 * `PanelChoices` in the sheet: rows 84 high, 24/600 label (text colour when chosen or focused, else muted), an optional
 * 18/500 line, "РЕКОМЕНДУЕТСЯ", the tick on the chosen one. Focus starts on the chosen; ◀ or Back close without a change.
 */
export function ChoiceList<T>(p: { options: ReadonlyArray<Choice<T>>; value: T; onPick: (v: T) => void; onClose: () => void; idPrefix?: string }) {
  const pre = `set-${p.idPrefix ?? "ch"}`;
  const at = Math.max(0, p.options.findIndex((o) => o.value === p.value));
  useEffect(() => { setTimeout(() => focusFirst(document, `${pre}-${at}`), 0); }, []);
  return (
    <div class="set-choices" onKeyDown={(e) => {
      if (e.key === "ArrowLeft" || e.keyCode === 37) { e.preventDefault(); e.stopPropagation(); p.onClose(); }
    }}>
      {p.options.map((o, i) => {
        const on = o.value === p.value;
        return (
          <button key={i} class={cls("st-focusable set-choice", on && "on", o.desc && "two")} data-focus={`${pre}-${i}`}
            onClick={() => p.onPick(o.value)}
            onFocus={(e) => startMarquee(e.currentTarget as HTMLElement)} onBlur={(e) => stopMarquee(e.currentTarget as HTMLElement)}>
            <span class="set-choice-body">
              <Mq cls="set-choice-label">{o.label}</Mq>
              {o.desc ? <span class="set-choice-desc">{o.desc}</span> : null}
            </span>
            {o.recommended ? <span class="st-tag set-rec">{t("sa_settings_panel_recommended").toUpperCase()}</span> : null}
            <span class="set-tick">{on ? <SIcon name="CHECK" size={24} /> : null}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * `PanelStepper` in the sheet: one 84-high surface, ‹ value (36/800 blue) ›. ◀ ▶ change it at once (or only on OK when
 * [confirm]: then Back cancels), OK closes.
 */
export function BigStepper(p: { value: string; onStep: (d: number) => void; onDone: () => void; preview?: ComponentChildren }) {
  useEffect(() => { setTimeout(() => focusFirst(document, "set-big-step"), 0); }, []);
  return (
    <>
      {p.preview ? <div class="set-step-preview">{p.preview}</div> : null}
      <button class="st-focusable set-bigstep" data-focus="set-big-step" onClick={p.onDone}
        onKeyDown={(e) => {
          const d = e.key === "ArrowLeft" || e.keyCode === 37 ? -1 : e.key === "ArrowRight" || e.keyCode === 39 ? 1 : 0;
          if (d !== 0) { e.preventDefault(); e.stopPropagation(); p.onStep(d); }
        }}>
        <span class="set-bigstep-chev left"><SIcon name="CHEVRON" size={26} /></span>
        <span class="set-bigstep-value">{p.value}</span>
        <span class="set-bigstep-chev"><SIcon name="CHEVRON" size={26} /></span>
      </button>
    </>
  );
}

/** `PanelSwitches`: a few on/off lines (External player's sections), each OK flips one. */
export function SwitchList(p: { items: Array<{ label: string; on: boolean; toggle: () => void; disabled?: boolean }> }) {
  useEffect(() => { setTimeout(() => focusFirst(document, "set-sw-0"), 0); }, []);
  return (
    <div class="set-choices">
      {p.items.map((it, i) => (
        <button key={i} class={cls("st-focusable set-choice", it.disabled && "off")} data-focus={`set-sw-${i}`} onClick={() => { if (!it.disabled) it.toggle(); }}>
          <span class="set-choice-body"><span class="set-choice-label on">{it.label}</span></span>
          <span class={cls("st-switch", it.on && "on")} />
        </button>
      ))}
    </div>
  );
}

/** Back pressed while [active]: caught before the app's own handler (capture phase). */
export function useBackKey(active: boolean, onBack: () => void): void {
  const fn = useRef(onBack);
  fn.current = onBack;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isBack(e) || (document.activeElement instanceof HTMLInputElement && e.key === "Backspace")) return;
      e.preventDefault(); e.stopImmediatePropagation(); fn.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [active]);
}

/** "Вкл." / "Выкл." */
export const onOffText = (on: boolean) => t(on ? "sa_common_on" : "sa_common_off");
