import type { ComponentChildren } from "preact";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { useReturnFocus } from "./returnFocus";

/*
 * Small Preact helpers over the Stage classes in ui.css (the Android app's components, TV-box look). Each focusable
 * one is a <button class="st-focusable ..."> with data-focus = [id], so the D-pad (`installDpad`) can reach it.
 * They draw only: state lives in the screen.
 */

type Press = { id?: string; onClick?: () => void; onKeyDown?: (e: KeyboardEvent) => void; className?: string };

const cls = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

/** One Settings group in the sheet's list (MorePages.kt `GroupLine`): a tall row, a 32 px icon and one bold word. */
export function GroupLine(p: Press & { icon: IconName; title: string }) {
  return (
    <button class={cls("st-focusable st-line", p.className)} data-focus={p.id} onClick={p.onClick} onKeyDown={p.onKeyDown as never}>
      <span class="st-line-icon"><Icon name={p.icon} size={32} /></span>
      <span class="st-line-text">{p.title}</span>
    </button>
  );
}

/**
 * A setting in the sheet (SettingsStage.kt `StageSettingRow`, side): the icon, the title, its current value as the
 * line under it, and [end] on the right for what is worked in place (a `Toggle`, a `Stepper`).
 */
export function SettingItem(p: Press & {
  icon?: IconName; title: string; value?: string; end?: ComponentChildren; disabled?: boolean; marked?: boolean;
}) {
  return (
    <button
      class={cls("st-focusable st-setting", p.disabled && "off", p.marked && "marked", p.className)}
      data-focus={p.id} onClick={p.onClick} onKeyDown={p.onKeyDown as never} aria-disabled={p.disabled || undefined}
    >
      {p.icon ? <span class="st-setting-icon"><Icon name={p.icon} size={38} /></span> : null}
      <span class="st-setting-body">
        <span class="st-setting-title">{p.title}</span>
        {p.value ? <span class="st-setting-value">{p.value}</span> : null}
      </span>
      {p.end !== undefined && p.end !== null ? <span class="st-setting-end">{p.end}</span> : null}
    </button>
  );
}

/** A part of a settings page ("Player", "Control"): 24/800, in text colour. */
export function SectionTitle(p: { children: ComponentChildren; first?: boolean }) {
  return <div class={cls("st-section", p.first && "first")}>{p.children}</div>;
}

/** The switch (`StageSwitch`), drawn only: the row it sits in takes the OK. */
export function Toggle(p: { on: boolean }) {
  return <span class={cls("st-switch", p.on && "on")} role="switch" aria-checked={p.on} />;
}

/** "− 90% +" (`StageStepper`), drawn only; a click on − or + steps when [onStep] is given (the remote uses ◀ ▶ on the row). */
export function Stepper(p: { value: string; onStep?: (d: number) => void }) {
  const step = (d: number) => (e: Event) => { if (p.onStep) { e.stopPropagation(); p.onStep(d); } };
  return (
    <span class="st-stepper">
      <span class="st-step" onClick={step(-1)}>−</span>
      <span class="st-step-value">{p.value}</span>
      <span class="st-step" onClick={step(1)}>+</span>
    </span>
  );
}

/** The segmented value of a settings row, drawn only (◀ ▶ on the row move the choice). */
export function Segmented(p: { options: readonly string[]; selected: number; onPick?: (i: number) => void }) {
  return (
    <span class="st-seg">
      {p.options.map((o, i) => (
        <span key={o} class={cls("st-seg-opt", i === p.selected && "on")}
          onClick={p.onPick ? (e) => { e.stopPropagation(); p.onPick?.(i); } : undefined}>{o}</span>
      ))}
    </span>
  );
}

/** A provider or quality tag (`StageTag`); [tint] draws it as an outline in that colour (TV-box). */
export function Badge(p: { children: ComponentChildren; tint?: string }) {
  return <span class={cls("st-tag", p.tint && "tint")} style={p.tint ? { "--tag-color": p.tint } : undefined}>{p.children}</span>;
}

/** The blue archive tag of a channel row ("3 дня"); [corner] pins it to the row's top-right corner (the row is relative). */
export function ArchiveTag(p: { text: string; corner?: boolean }) {
  return <span class={cls("st-archive", p.corner && "corner")}>{p.text}</span>;
}

/** A tool in a tool row (`StageTool`): "Provider", "Guide view"; [boxed] = the grey slab; [value] = the bold part. */
export function ToolbarButton(p: Press & { icon?: IconName; text?: string; value?: string; boxed?: boolean; danger?: boolean }) {
  return (
    <button class={cls("st-focusable st-tool", p.boxed && "boxed", p.danger && "danger", p.className)}
      data-focus={p.id} onClick={p.onClick} onKeyDown={p.onKeyDown as never}>
      {p.icon ? <Icon name={p.icon} size={20} /> : null}
      {p.text ? <span>{p.text}</span> : null}
      {p.value ? <span class="st-tool-value">{p.value}</span> : null}
    </button>
  );
}

/** A button (`StageButton`, TV-box): the grey slab, 64 high (or 56 with [small]); focus = plate + 1.04 lift. */
export function Button(p: Press & { icon?: IconName; text?: string; trailing?: string; small?: boolean }) {
  const round = !p.text && !!p.icon;
  return (
    <button class={cls("st-focusable st-button", p.small && "sm", round && "round", p.className)}
      data-focus={p.id} onClick={p.onClick} onKeyDown={p.onKeyDown as never}>
      {p.icon ? <Icon name={p.icon} size={p.small ? 19 : 22} /> : null}
      {p.text ? <span>{p.text}</span> : null}
      {p.trailing ? <span class="st-button-trail">{p.trailing}</span> : null}
    </button>
  );
}

/**
 * A button inside a popup's content (`StagePopupButton`, Android 2.5.2): one look in every popup, no accent colour —
 * the main one ([primary], the default) white with dark text, the others grey; the focused one fully white and 1.06
 * larger, so where the focus is never depends on which button it is. Square corners in the TV-box look.
 */
export function PopupButton(p: Press & { text: string; icon?: IconName; primary?: boolean; disabled?: boolean; compact?: boolean }) {
  return (
    <button class={cls("st-focusable st-pbutton", p.primary !== false && "primary", p.compact && "compact", p.disabled && "off", p.className)}
      data-focus={p.id} onClick={p.disabled ? undefined : p.onClick} onKeyDown={p.onKeyDown as never} aria-disabled={p.disabled || undefined}>
      <span class="st-pbutton-in">
        {p.icon ? <Icon name={p.icon} size={p.compact ? 25 : 36} /> : null}
        <span class="st-pbutton-text">{p.text}</span>
      </span>
    </button>
  );
}

/** A menu row (`StageMenuItem`, TV-box): icon, text, the dim value (blue on focus) or the accent check. */
export function MenuItem(p: Press & { icon?: IconName; text: string; value?: string; checked?: boolean; disabled?: boolean; lead?: ComponentChildren }) {
  return (
    <button class={cls("st-focusable st-menu-item", p.disabled && "off", p.className)}
      data-focus={p.id} onClick={p.disabled ? undefined : p.onClick} onKeyDown={p.onKeyDown as never} aria-pressed={p.checked}>
      {p.icon ? <Icon name={p.icon} size={28} /> : null}
      {p.lead}
      <span class="st-menu-item-text">{p.text}</span>
      {p.value ? <span class="st-menu-value">{p.value}</span> : null}
      {p.checked ? <span class="st-check"><Icon name="check" size={22} /></span> : null}
    </button>
  );
}

/** A popup row (`StagePopupOption`): title, optional line, accent value with ›, the check of the chosen one. */
export function Option(p: Press & {
  title: string; subtitle?: string; value?: string; checked?: boolean; danger?: boolean; chosen?: boolean; disabled?: boolean; lead?: ComponentChildren;
}) {
  return (
    <button class={cls("st-focusable st-option", p.subtitle && "two", p.danger && "danger", p.chosen && "chosen", p.disabled && "off", p.className)}
      data-focus={p.id} onClick={p.disabled ? undefined : p.onClick} onKeyDown={p.onKeyDown as never} aria-pressed={p.checked}>
      {p.lead ? <span class="st-option-lead">{p.lead}</span> : null}
      <span class="st-option-body">
        <span class="st-option-title">{p.title}</span>
        {p.subtitle ? <span class="st-option-sub">{p.subtitle}</span> : null}
      </span>
      {p.value ? <span class="st-option-value">{`${p.value} ›`}</span> : null}
      {p.checked !== undefined ? <span class="st-check">{p.checked ? <Icon name="check" size={24} /> : null}</span> : null}
    </button>
  );
}

/** A side-panel row (`StageSidePanelOption`): icon, title and a line under it; [danger] in red. */
export function PanelOption(p: Press & { icon: IconName; title: string; subtitle?: string; danger?: boolean }) {
  return (
    <button class={cls("st-focusable st-panel-option", p.danger && "danger", p.className)}
      data-focus={p.id} onClick={p.onClick} onKeyDown={p.onKeyDown as never}>
      <Icon name={p.icon} size={30} />
      <span class="st-panel-option-body">
        <span class="st-panel-option-title">{p.title}</span>
        {p.subtitle ? <span class="st-panel-option-sub">{p.subtitle}</span> : null}
      </span>
    </button>
  );
}

/** A progress track (`StageProgress`): 6 px accent, or [flat] = the channel row's 4 px ink bar. [value] 0..1. */
export function Progress(p: { value: number; flat?: boolean }) {
  const f = Math.max(0, Math.min(1, p.value));
  return <span class={cls("st-progress", p.flat && "flat")}><i style={{ width: `${(f * 100).toFixed(2)}%` }} /></span>;
}

/**
 * A popup (`StagePopup`): the wash over the screen, one card (radius 30, [width] 880 by default) with the eyebrow,
 * title and body, then [children], then [buttons] at the bottom right. [top] keeps it 40 px from the top edge (Android
 * moves it there while the TV keyboard is up). Focus stays inside (`data-modal`); a click outside is [onClose].
 */
export function Popup(p: {
  label?: string; eyebrow?: string; title?: string; body?: string; width?: number; top?: boolean;
  onClose: () => void; closing?: boolean; returnFocus?: boolean; buttons?: ComponentChildren; children?: ComponentChildren; className?: string;
}) {
  const root = useReturnFocus<HTMLDivElement>(!!p.closing, !!p.returnFocus);
  const head = p.eyebrow || p.title || p.body;
  return (
    <div class={cls("st-layer st-popup-layer", p.top && "top", p.closing && "closing")} data-modal={p.closing ? undefined : ""} onClick={p.onClose}>
      <div ref={root} class={cls("st-popup", p.className)} role="dialog" aria-label={p.label ?? p.title}
        style={p.width ? { width: `${p.width}px` } : undefined} onClick={(e) => e.stopPropagation()}>
        {head ? (
          <div class="st-popup-head">
            {p.eyebrow ? <div class="st-popup-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <div class="st-popup-title">{p.title}</div> : null}
            {p.body ? <div class="st-popup-body">{p.body}</div> : null}
          </div>
        ) : null}
        {p.children}
        {p.buttons ? <div class="st-popup-buttons">{p.buttons}</div> : null}
      </div>
    </div>
  );
}

/**
 * A menu card (`StageMenu`, TV-box: a solid card, radius 28) over the wash: [place] "center" (a channel's menu, 640
 * wide) or "top-end" (the playlist switcher under its pill, 520 wide). [title]/[subtitle]/[lead] = `StageMenuHeader`.
 */
export function Menu(p: {
  label?: string; title?: string; subtitle?: string; lead?: ComponentChildren; width?: number; place?: "center" | "top-end";
  onClose: () => void; closing?: boolean; returnFocus?: boolean; footer?: ComponentChildren; children?: ComponentChildren; className?: string;
}) {
  const root = useReturnFocus<HTMLDivElement>(!!p.closing, !!p.returnFocus);
  return (
    <div class={cls("st-layer st-menu-layer", p.place ?? "center", p.closing && "closing")} data-modal={p.closing ? undefined : ""} onClick={p.onClose}>
      <div ref={root} class={cls("st-menu", p.className)} role="dialog" aria-label={p.label ?? p.title}
        style={{ width: `${p.width ?? (p.place === "top-end" ? 520 : 640)}px` }} onClick={(e) => e.stopPropagation()}>
        {p.title ? (
          <div class="st-menu-head">
            {p.lead ? <span class="st-menu-lead">{p.lead}</span> : null}
            <span class="st-menu-text">
              <span class="st-menu-title" style={{ display: "block" }}>{p.title}</span>
              {p.subtitle ? <span class="st-menu-sub" style={{ display: "block" }}>{p.subtitle}</span> : null}
            </span>
          </div>
        ) : null}
        <div class="st-menu-list">{p.children}</div>
        {p.footer}
      </div>
    </div>
  );
}
