// Programme reminders, the Android app's rules (core/reminder/ReminderSchedule.kt): the guide's
// "Remind me" sets one, the start-time prompt reads them. Arithmetic only, no clock of its own.

/** A programme to be reminded of. [channel] is the stable channel key the app looks the channel up by. */
export interface Reminder {
  channel: string;
  channelName: string;
  title: string;
  start: number;
  stop: number;
  /** Minutes before the start the reminder comes. */
  lead: number;
}

/** "Remind me (5 min before)". */
export const DEFAULT_LEAD_MINUTES = 5;

/** The *Reminder time* setting's choices: at the start, 1 or 5 minutes before. */
export const LEAD_CHOICES = [0, 1, 5] as const;

/** What happens when a reminder comes: ask to switch, switch at once, or only say so. */
export type ReminderMode = "ask" | "switch" | "notify";

/** The moment [r] comes up. */
export function remindAt(r: Reminder): number {
  return r.start - r.lead * 60_000;
}

/** When [r] should fire, or null once its programme has ended; one already past its moment fires now. */
export function wakeAt(r: Reminder, now: number): number | null {
  return r.stop <= now ? null : Math.max(remindAt(r), now);
}

/** The prompt's queue: the reminder moment has come and the programme is still on. Soonest first. */
export function due(reminders: readonly Reminder[], now: number): Reminder[] {
  return reminders.filter((r) => remindAt(r) <= now && r.stop > now).sort((a, b) => a.start - b.start);
}

/** Whether a reminder can still be set for a programme: not once it has started. */
export function canRemind(start: number, now: number): boolean {
  return start > now;
}

/** One reminder per programme: the same channel and start. */
export function sameProgramme(a: Pick<Reminder, "channel" | "start">, b: Pick<Reminder, "channel" | "start">): boolean {
  return a.channel === b.channel && a.start === b.start;
}

/** [r] added (replacing a reminder of the same programme), and the ones whose programme has ended dropped. */
export function addReminder(list: readonly Reminder[], r: Reminder, now: number): Reminder[] {
  return [...list.filter((x) => !sameProgramme(x, r) && x.stop > now), r];
}

/** The reminder of the programme [p] removed: answered (Watch or Dismiss both end it) or cancelled. */
export function removeReminder(list: readonly Reminder[], p: Pick<Reminder, "channel" | "start">): Reminder[] {
  return list.filter((x) => !sameProgramme(x, p));
}
