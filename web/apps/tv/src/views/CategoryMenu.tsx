import { useEffect, useRef, useState } from "preact/hooks";
import { focusFirst, Menu, MenuItem, Option, Popup, PopupButton } from "@skmate/ui";
import { SIcon } from "./SettingsKit";
import { t } from "../i18n";
import { restorePlan, type CategoryState } from "../state/categories";

/*
 * The long-press menu of a provider category on Home (Android shell/components/CategoryContextMenu.kt, LiveScreen.kt
 * categoryMoveState): Move (the order of the categories, MoveOrderOverlay), Hide, "Restore to playlist default" (asks
 * what it will change first), Cancel. Built-in entries (Favourites, All ...) have no menu, as on Android.
 */

/** The menu card; the keys are the page's own (Up/Down walk, OK presses, Back is the owner's). */
export function CategoryMenu(p: {
  name: string; closing: boolean; onMove: () => void; onHide: () => void; onRestore: () => void; onClose: () => void;
}) {
  return (
    <Menu title={p.name} width={520} onClose={p.onClose} closing={p.closing} className="home-menu">
      <MenuItem id="cat-move" lead={<SIcon name="MOVE" size={28} />} text={t("kp_move")} onClick={p.onMove} />
      <MenuItem id="cat-hide" lead={<SIcon name="EYE_OFF" size={28} />} text={t("kp_hide")} onClick={p.onHide} />
      <MenuItem id="cat-restore" lead={<SIcon name="REFRESH" size={28} />} text={t("kp_restore_playlist")} onClick={p.onRestore} />
      <MenuItem id="cat-cancel" lead={<SIcon name="CLOSE" size={28} />} text={t("sa_common_cancel")} onClick={p.onClose} />
      <FocusOn id="cat-move" />
    </Menu>
  );
}

/** What restoring will change (RestoreConfirmPopup): the lines, then Restore (only when there is something) and Cancel. */
export function RestoreConfirm(p: { name: string; state: CategoryState; closing: boolean; onRestore: () => void; onClose: () => void }) {
  const plan = restorePlan(p.state);
  const nothing = plan.hidden === 0 && !plan.order;
  return (
    <Menu title={p.name} width={520} onClose={p.onClose} closing={p.closing} className="home-menu">
      <div class="st-menu-note">{t(nothing ? "kp_restore_nothing" : "kp_restore_question")}</div>
      {plan.hidden > 0 ? <div class="st-menu-bullet">{t(plan.hidden === 1 ? "kp_restore_hidden_one" : "kp_restore_hidden", { n: plan.hidden })}</div> : null}
      {plan.order ? <div class="st-menu-bullet">{t("kp_restore_order")}</div> : null}
      {nothing ? null : <MenuItem id="rc-restore" lead={<SIcon name="REFRESH" size={28} />} text={t("kp_restore_playlist")} onClick={p.onRestore} />}
      <MenuItem id="rc-cancel" lead={<SIcon name="CLOSE" size={28} />} text={t("sa_common_cancel")} onClick={p.onClose} />
      <FocusOn id={nothing ? "rc-cancel" : "rc-restore"} />
    </Menu>
  );
}

/**
 * Reordering (MoveOrderOverlay.kt): the row carried starts as the long-pressed one; Up / Down carry it (OK puts it down
 * or picks it up again; a row that is not carried is only walked to), Save keeps the order, Cancel / Back drops it.
 */
export function MoveOrder(p: { title: string; names: readonly string[]; start: number; closing: boolean; onSave: (order: string[]) => void; onCancel: () => void }) {
  const [list, setList] = useState<string[]>(() => p.names.slice());
  const [picked, setPicked] = useState<number | null>(p.start);
  const root = useRef<HTMLDivElement>(null);
  const at = useRef(p.start);
  const focusRow = (i: number) => { at.current = i; setTimeout(() => root.current?.querySelector<HTMLElement>(`[data-focus="mv-${i}"]`)?.focus(), 0); };
  useEffect(() => { focusRow(p.start); }, []);
  const go = (to: number) => {
    const clamped = Math.max(0, Math.min(list.length - 1, to));
    if (picked !== null && picked !== clamped) {
      const next = list.slice();
      next.splice(clamped, 0, next.splice(picked, 1)[0] as string);
      setList(next); setPicked(clamped);
    }
    focusRow(clamped);
  };
  // Up / Down carry the row only from the list; from the buttons they move the focus as usual (the dpad's own search).
  const onKeyDown = (e: KeyboardEvent) => {
    const inList = !!(document.activeElement as HTMLElement | null)?.dataset.focus?.startsWith("mv-");
    if (!inList) return;
    const dir = e.key === "ArrowUp" || e.keyCode === 38 ? -1 : e.key === "ArrowDown" || e.keyCode === 40 ? 1 : 0;
    if (dir === 0) return;
    e.preventDefault(); e.stopPropagation();
    const here = Number((document.activeElement as HTMLElement).dataset.focus?.slice(3));
    if (dir > 0 && here === list.length - 1) { focusFirst(root.current ?? document, "mv-save"); return; }
    go((picked ?? here) + dir);
  };
  return (
    <Popup title={p.title} body={t("kp_move_instructions")} width={760} onClose={p.onCancel} closing={p.closing} className="home-move"
      buttons={<><PopupButton id="mv-cancel" primary={false} text={t("sa_common_cancel")} onClick={p.onCancel} /><PopupButton id="mv-save" text={t("sa_common_save")} onClick={() => p.onSave(list)} /></>}>
      <div class="home-move-list" ref={root} onKeyDown={onKeyDown as unknown as (e: Event) => void}>
        {list.map((name, i) => (
          <Option key={name} id={`mv-${i}`} title={name} chosen={picked === i}
            lead={<SIcon name="MOVE" size={24} />} onClick={() => setPicked(picked === i ? null : i)} />
        ))}
      </div>
    </Popup>
  );
}

function FocusOn({ id }: { id: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { const box = ref.current?.closest(".st-menu"); if (box) focusFirst(box, id); }, []);
  return <span ref={ref} hidden />;
}
