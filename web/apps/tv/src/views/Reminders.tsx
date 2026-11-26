import { useEffect } from "preact/hooks";
import type { Channel, Reminder } from "@skmate/core";
import type { Programme } from "@skmate/epg";
import { Button, focusFirst, Icon, Popup, PopupButton } from "@skmate/ui";
import { t } from "../i18n";
import { clock } from "../time";

/**
 * A programme still to come, picked in the guide or the search: watch its channel now, or be reminded of it.
 * Drawn as the Android app's StagePopup (760 wide): the eyebrow with the bell, the title 38/800, the buttons.
 */
export function ProgrammeDialog(p: {
  channel: Channel;
  programme: Programme;
  reminded: boolean;
  onWatch: () => void;
  onRemind: () => void;
  onCancelRemind: () => void;
  onClose: () => void;
}) {
  useEffect(() => { setTimeout(() => focusFirst(document, "pd-remind"), 30); }, []);
  return (
    <Popup width={760} returnFocus label={p.programme.title} onClose={p.onClose}
      eyebrow={t("remindStartsAt", { channel: p.channel.name, time: clock(p.programme.start) })} title={p.programme.title}
      buttons={(
        <>
          {/* StagePopupButton (2.5.2), as the guide programme popup (GuideCore.kt): "Watch channel" the main one, with
              the play mark; the rest grey. */}
          <PopupButton primary={false} id="pd-close" text={t("remindClose")} onClick={p.onClose} />
          <PopupButton id="pd-watch" icon="play" text={t("remindWatchChannel")} onClick={p.onWatch} />
          {p.reminded
            ? <PopupButton primary={false} id="pd-remind" text={t("remindCancel")} onClick={p.onCancelRemind} />
            : <PopupButton primary={false} id="pd-remind" icon="bell" text={t("remind")} onClick={p.onRemind} />}
        </>
      )}
    />
  );
}

/**
 * The start-time prompt (GuideStage.kt ReminderPrompt), over any screen and the player too: 760 wide, the bell and
 * when in the accent, the title 38/800, then "Watch" (focused) and "Close". Watch switches, Close lets it be.
 */
export function ReminderPrompt(p: { reminder: Reminder; now: number; onWatch: () => void; onClose: () => void }) {
  useEffect(() => { const id = setTimeout(() => focusFirst(document, "rp-watch"), 60); return () => clearTimeout(id); }, [p.reminder.start, p.reminder.channel]);
  const r = p.reminder;
  const line = r.start <= p.now ? t("remindOnNow", { channel: r.channelName }) : t("remindStartsAt", { channel: r.channelName, time: clock(r.start) });
  return (
    <Popup width={760} returnFocus label={t("remindSoon")} onClose={p.onClose} eyebrow={line} title={r.title}
      buttons={(
        <>
          <Button small id="rp-watch" icon="live_tv" text={t("remindWatch")} onClick={p.onWatch} />
          <Button small id="rp-close" text={t("remindClose")} onClick={p.onClose} />
        </>
      )}
    />
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
