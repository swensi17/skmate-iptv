import { useEffect } from "preact/hooks";
import type { Channel, Reminder } from "@skmate/core";
import type { Programme } from "@skmate/epg";
import { focusFirst, Icon } from "@skmate/ui";
import { t } from "../i18n";
import { clock } from "../time";

/** A programme still to come, picked in the guide or the search: watch its channel now, or be reminded of it. */
export function ProgrammeDialog(p: {
  channel: Channel;
  programme: Programme;
  reminded: boolean;
  onWatch: () => void;
  onRemind: () => void;
  onCancelRemind: () => void;
  onClose: () => void;
}) {
  useEffect(() => { focusFirst(document, "pd-remind"); }, []);
  return (
    <div class="scrim" data-modal>
      <div class="dialog" role="dialog" aria-label={p.programme.title}>
        <div class="dialog-title">{p.programme.title}</div>
        <div class="dialog-body">{t("remindStartsAt", { channel: p.channel.name, time: clock(p.programme.start) })}</div>
        <div class="dialog-actions">
          <button class="btn" data-focus="pd-close" onClick={p.onClose}>{t("remindClose")}</button>
          <button class="btn" data-focus="pd-watch" onClick={p.onWatch}>{t("remindWatchChannel")}</button>
          {p.reminded
            ? <button class="btn" data-focus="pd-remind" onClick={p.onCancelRemind}>{t("remindCancel")}</button>
            : <button class="btn" data-focus="pd-remind" onClick={p.onRemind}><Icon name="bell" size={28} />{t("remind")}</button>}
        </div>
      </div>
    </div>
  );
}

/** The start-time prompt, over any screen and the player too, as on Android: Watch switches, Close lets it be. */
export function ReminderPrompt(p: { reminder: Reminder; now: number; onWatch: () => void; onClose: () => void }) {
  useEffect(() => { focusFirst(document, "rp-watch"); }, [p.reminder.start, p.reminder.channel]);
  const r = p.reminder;
  const line = r.start <= p.now ? t("remindOnNow", { channel: r.channelName }) : t("remindStartsAt", { channel: r.channelName, time: clock(r.start) });
  return (
    <div class="scrim" data-modal>
      <div class="dialog" role="alertdialog" aria-label={t("remindSoon")}>
        <div class="dialog-title"><Icon name="bell" size={36} /> {t("remindSoon")}</div>
        <div class="dialog-body"><b class="rp-title">{r.title}</b><br />{line}</div>
        <div class="dialog-actions">
          <button class="btn" data-focus="rp-close" onClick={p.onClose}>{t("remindClose")}</button>
          <button class="btn" data-focus="rp-watch" onClick={p.onWatch}>{t("remindWatch")}</button>
        </div>
      </div>
    </div>
  );
}

/** "Only notify": a line at the top for a few seconds, the picture keeps going. */
export function ReminderNote(p: { reminder: Reminder; now: number }) {
  const r = p.reminder;
  return (
    <div class="toast" role="status">
      <Icon name="bell" size={28} />
      <span>{r.title} · {r.start <= p.now ? t("remindOnNow", { channel: r.channelName }) : t("remindStartsAt", { channel: r.channelName, time: clock(r.start) })}</span>
    </div>
  );
}
