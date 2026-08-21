/**
 * What a reminder is, and when the next one is due.
 *
 * This is the part of reminders worth being certain about, so it is pure: a
 * day, a moment and the user's settings in, a reminder or `null` out. Nothing
 * here schedules anything, reads the clock or touches a platform API — the
 * moment arrives as an argument, per docs/technical-spec.md, "Time".
 *
 * The rules it encodes come from docs/functional-spec.md, "Reminders":
 *
 * - a reminder is due the configured interval after the most recent entry;
 * - once the day's goal is met, there is no next reminder that day;
 * - no reminder is scheduled to fire inside the quiet-hours window;
 * - reminders can be switched off entirely.
 *
 * All four are decided here rather than in the service, so "would a reminder
 * be scheduled, and when" is one function a test can ask directly.
 *
 * ## Quiet hours move a reminder rather than dropping it
 *
 * docs/architecture.md, "Data flow, a reminder": "The quiet-hours window is
 * applied when choosing the fire time. If the computed time falls inside the
 * window, the reminder moves to the end of it." So a reminder due at three in
 * the morning is scheduled for seven, not scheduled and then dismissed — the
 * device is never asked to make a sound the user asked it not to, per
 * docs/technical-spec.md, "Notifications".
 */
import { Day, isGoalMet, IsoTimestamp, timeSinceLastEntry, toInstant } from '../domain';
import { outsideQuietHours } from './quietHours';
import {
  assertReminderSettings,
  defaultReminderSettings,
  ReminderSettings,
} from './settings';

/** What the notification says. Exported so tests assert on the real wording. */
export const REMINDER_TITLE = 'Time for a glass';
export const REMINDER_BODY = 'It has been a while. A glass of water now keeps the day on track.';

/** A notification that would be shown, and the moment it would be shown at. */
export interface Reminder {
  readonly title: string;
  readonly body: string;
  /** ISO 8601, so a reminder is a plain value that survives being logged. */
  readonly fireAt: IsoTimestamp;
}

/**
 * When the next reminder for this day is due, or `null` when there is none:
 * reminders switched off, or the day's goal already met.
 *
 * The interval runs from the most recent entry, so logging a glass moves the
 * reminder rather than adding one. Two cases share an answer of "a full
 * interval from now": a day with nothing logged yet, and a day whose interval
 * has already elapsed. The second is someone opening the app long overdue —
 * they are looking at it, so the useful reminder is the next one rather than
 * one already late.
 *
 * The time that comes out is then moved clear of the quiet-hours window, which
 * is the only step that can push a reminder past midnight into the next day.
 */
export function nextReminderAt(
  day: Day,
  now: Date | string,
  settings: ReminderSettings = defaultReminderSettings(),
): IsoTimestamp | null {
  assertReminderSettings(settings);

  const at = toInstant(now, 'The current moment');

  if (!settings.enabled || isGoalMet(day)) {
    return null;
  }

  const elapsed = timeSinceLastEntry(day, at);
  const remaining =
    elapsed === null || elapsed >= settings.intervalMs
      ? settings.intervalMs
      : settings.intervalMs - elapsed;
  const due = new Date(at.getTime() + remaining);

  return outsideQuietHours(settings.quietHours, due).toISOString();
}

/**
 * The reminder to schedule for this day, or `null` when there is none to
 * schedule.
 */
export function planReminder(
  day: Day,
  now: Date | string,
  settings: ReminderSettings = defaultReminderSettings(),
): Reminder | null {
  const fireAt = nextReminderAt(day, now, settings);

  return fireAt === null ? null : { title: REMINDER_TITLE, body: REMINDER_BODY, fireAt };
}
