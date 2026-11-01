import { describe, expect, it } from "vitest";
import { addReminder, canRemind, due, removeReminder, wakeAt, type Reminder } from "./reminders";

// The Android app's ReminderScheduleTest, case for case.
const min = 60_000;
const reminder = (start: number, stop: number, lead: number, channel = "c259"): Reminder =>
  ({ channel, channelName: "Sky Cinema Family", title: "Toy Story 4", start, stop, lead });

describe("reminder schedule", () => {
  it("wakes lead minutes before the start", () => {
    expect(wakeAt(reminder(100 * min, 200 * min, 5), 10 * min)).toBe(95 * min);
  });
  it("fires now when already past its moment", () => {
    const r = reminder(100 * min, 200 * min, 5);
    expect(wakeAt(r, 97 * min)).toBe(97 * min);
    expect(wakeAt(r, 150 * min)).toBe(150 * min);
  });
  it("has no alarm once the programme has ended", () => {
    expect(wakeAt(reminder(100 * min, 200 * min, 0), 200 * min)).toBeNull();
  });
  it("keeps due only reminders whose moment has come and whose programme is on", () => {
    const early = reminder(100 * min, 200 * min, 10, "a"); // due at 90
    const later = reminder(120 * min, 180 * min, 0, "b"); // due at 120
    const ended = reminder(10 * min, 60 * min, 0, "c");
    expect(due([later, ended, early], 95 * min)).toEqual([early]);
    expect(due([later, early], 120 * min)).toEqual([early, later]);
    expect(due([early, later], 89 * min)).toEqual([]);
  });
  it("sets no reminder for a programme that has started", () => {
    expect(canRemind(101 * min, 100 * min)).toBe(true);
    expect(canRemind(100 * min, 100 * min)).toBe(false);
  });
});

describe("reminder list", () => {
  it("keeps one reminder per programme and drops the ended ones", () => {
    const a = reminder(100 * min, 200 * min, 5);
    const again = { ...a, lead: 0 };
    const old = reminder(1 * min, 2 * min, 0, "x");
    expect(addReminder([a, old], again, 50 * min)).toEqual([again]);
  });
  it("removes the reminder of one programme only", () => {
    const a = reminder(100 * min, 200 * min, 5, "a");
    const b = reminder(100 * min, 200 * min, 5, "b");
    expect(removeReminder([a, b], { channel: "a", start: 100 * min })).toEqual([b]);
  });
});
