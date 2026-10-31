import type { Key } from "../i18n";
import { t } from "../i18n";

export interface Choice<T> { value: T; label: string }

interface Props<T> {
  id: string;
  title: Key;
  hint?: Key;
  value: T;
  options: ReadonlyArray<Choice<T>>;
  onPick: (value: T) => void;
}

const LEFT = [37];
const RIGHT = [39];

/**
 * One setting across the whole line: the name on the left, the choices on the right, the chosen one lit.
 * Left and Right change the value in place (no menu to open), OK steps to the next one, a click picks a choice.
 */
export function SettingRow<T>(p: Props<T>) {
  const at = Math.max(0, p.options.findIndex((o) => o.value === p.value));
  const move = (d: number) => {
    const next = p.options[Math.max(0, Math.min(p.options.length - 1, at + d))];
    if (next) p.onPick(next.value);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const dir = e.key === "ArrowLeft" || LEFT.includes(e.keyCode) ? -1 : e.key === "ArrowRight" || RIGHT.includes(e.keyCode) ? 1 : 0;
    if (dir === 0) return;
    // The arrows belong to this row now: they change the value, they do not move the focus away.
    e.stopPropagation();
    e.preventDefault();
    move(dir);
  };
  return (
    <button
      class="srow" data-focus={p.id} role="radiogroup" aria-label={t(p.title)}
      onKeyDown={onKeyDown as unknown as (e: Event) => void}
      onClick={() => { const next = p.options[(at + 1) % p.options.length]; if (next) p.onPick(next.value); }}
    >
      <span class="srow-text">
        <span class="srow-title">{t(p.title)}</span>
        {p.hint ? <span class="srow-hint">{t(p.hint)}</span> : null}
      </span>
      <span class="srow-arrow" aria-hidden="true">‹</span>
      <span class="chips">
        {p.options.map((o) => (
          <span
            class="chip" key={String(o.value)} aria-pressed={o.value === p.value}
            onClick={(e) => { e.stopPropagation(); p.onPick(o.value); }}
          >
            {o.label}
          </span>
        ))}
      </span>
      <span class="srow-arrow" aria-hidden="true">›</span>
    </button>
  );
}

export const onOff = (): Array<Choice<boolean>> => [
  { value: false, label: t("off") },
  { value: true, label: t("on") },
];
