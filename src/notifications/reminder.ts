/**
 * What a reminder is, and when the next one is due.
 *
 * This is the part of reminders worth being certain about, so it is pure: a
 * day and a moment in, a reminder or `null` out. Nothing here schedules
 * anything, reads the clock or touches a platform API — the moment arrives as
 * an argument, per docs/technical-spec.md, "Time".
 *
 * The rules it encodes come from docs/functional-spec.md, "Reminders":
 *
 * - a reminder is due the configured interval after the most recent entry;
 * - once the day's goal is met, there is no next reminder that day.
 *
 * The interval is a fixed constant here. TASK-009 makes it — and quiet hours —
 * configurable, which is why every function takes it as an argument rather
 * than reading the constant itself.
 */
import { Day, isGoalMet, IsoTimestamp, timeSinceLastEntry, toInstant } from '../domain';

/**
 * How long without a glass before the user is reminded. Two hours: often
 * enough to matter across a working day, rare enough not to be a nuisance.
 */
export const REMINDER_INTERVAL_MS = 2 * 60 * 60 * 1000;

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
 * Narrows an unknown value to a usable interval, throwing `TypeError`
 * otherwise. Zero or a negative interval would schedule a reminder in the past
 * — one that never fires — so it is refused here rather than silently ignored
 * by the platform.
 */
export function assertIntervalMs(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(
      `A reminder interval must be a number of milliseconds greater than zero, received ${
        typeof value === 'number' ? String(value) : typeof value
      }`,
    );
  }
}

/**
 * When the next reminder for this day is due, or `null` when none is: the goal
 * being met is the whole of that case, per docs/functional-spec.md.
 *
 * The interval runs from the most recent entry, so logging a glass moves the
 * reminder rather than adding one. Two cases share an answer of "a full
 * interval from now": a day with nothing logged yet, and a day whose interval
 * has already elapsed. The second is someone opening the app long overdue —
 * they are looking at it, so the useful reminder is the next one rather than
 * one already late.
 */
export function nextReminderAt(
  day: Day,
  now: Date | string,
  intervalMs: number = REMINDER_INTERVAL_MS,
): IsoTimestamp | null {
  assertIntervalMs(intervalMs);

  const at = toInstant(now, 'The current moment');

  if (isGoalMet(day)) {
    return null;
  }

  const elapsed = timeSinceLastEntry(day, at);
  const remaining = elapsed === null || elapsed >= intervalMs ? intervalMs : intervalMs - elapsed;

  return new Date(at.getTime() + remaining).toISOString();
}

/**
 * The reminder to schedule for this day, or `null` when there is none to
 * schedule.
 */
export function planReminder(
  day: Day,
  now: Date | string,
  intervalMs: number = REMINDER_INTERVAL_MS,
): Reminder | null {
  const fireAt = nextReminderAt(day, now, intervalMs);

  return fireAt === null ? null : { title: REMINDER_TITLE, body: REMINDER_BODY, fireAt };
}
