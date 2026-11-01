import { useEffect, useMemo, useState } from "preact/hooks";
import { addReminder, due, removeReminder, type Reminder } from "@skmate/core";
import { scoped } from "./scope";

const KEY = "skmate.reminders.v1";
/** How often the clock is looked at: a reminder comes up within this of its moment. */
const TICK_MS = 10_000;

function loadAll(): Reminder[] {
  try {
    const raw = JSON.parse(localStorage.getItem(scoped(KEY)) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as Reminder[]).filter((r) => r && typeof r.channel === "string" && typeof r.start === "number") : [];
  } catch {
    return [];
  }
}

function saveAll(list: readonly Reminder[]): void {
  try { localStorage.setItem(scoped(KEY), JSON.stringify(list)); } catch { /* the reminder lives until the app closes */ }
}

/** The profile's programme reminders, and the ones whose moment has come (the start-time prompt's queue). */
export function useReminders() {
  const [list, setList] = useState<Reminder[]>(loadAll);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), TICK_MS); return () => clearInterval(id); }, []);
  const update = (next: Reminder[]) => { saveAll(next); setList(next); };
  const dueNow = useMemo(() => due(list, now), [list, now]);
  return {
    list,
    due: dueNow,
    add: (r: Reminder) => update(addReminder(list, r, Date.now())),
    remove: (p: Pick<Reminder, "channel" | "start">) => update(removeReminder(list, p)),
    has: (channel: string, start: number) => list.some((r) => r.channel === channel && r.start === start),
  };
}
