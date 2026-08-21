/**
 * When the next reminder is due.
 *
 * This is the pure half of reminders, so these are plain function calls
 * against plain values: a day and a moment in, a reminder or `null` out. The
 * moment is always passed in, per docs/testing-strategy.md, "Time", so nothing
 * here depends on when the suite happens to run.
 *
 * Modules are imported directly rather than through `src/notifications`, whose
 * barrel re-exports the device scheduler and would therefore load
 * `expo-notifications`. CI has no device, and no test here needs one.
 */
import { addEntry, createDay, createEntry, createGoal, Day } from '../../src/domain';
import {
  assertIntervalMs,
  nextReminderAt,
  planReminder,
  REMINDER_BODY,
  REMINDER_INTERVAL_MS,
  REMINDER_TITLE,
} from '../../src/notifications/reminder';

/** A fixed moment, so which day is "today" never depends on when this runs. */
const NOW = new Date('2026-08-18T10:00:00.000Z');

const minutes = (count: number): number => count * 60 * 1000;
const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);
const iso = (offsetMs: number): string => at(offsetMs).toISOString();

const GOAL = createGoal(1000);

/** A day whose glasses were logged at the given offsets from `NOW`. */
function dayWith(...offsetsMs: number[]): Day {
  return offsetsMs.reduce(
    (day, offset) => addEntry(day, createEntry(200, at(offset))),
    createDay(NOW, GOAL),
  );
}

describe('the reminder interval', () => {
  it('is two hours', () => {
    expect(REMINDER_INTERVAL_MS).toBe(2 * 60 * 60 * 1000);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses %p as an interval',
    (interval) => {
      expect(() => assertIntervalMs(interval)).toThrow(TypeError);
      expect(() => nextReminderAt(dayWith(), NOW, interval)).toThrow(TypeError);
    },
  );

  it.each([null, undefined, '2h'])('refuses %p as an interval', (interval) => {
    expect(() => assertIntervalMs(interval)).toThrow(TypeError);
  });
});

describe('when the next reminder is due', () => {
  it('is the interval after the most recent glass', () => {
    // Logged half an hour ago, so the reminder is due an hour and a half from
    // now — two hours after the glass itself.
    const day = dayWith(-minutes(30));

    expect(nextReminderAt(day, NOW)).toBe(iso(REMINDER_INTERVAL_MS - minutes(30)));
  });

  it('counts from the most recent glass rather than the first', () => {
    const day = dayWith(-minutes(90), -minutes(10));

    expect(nextReminderAt(day, NOW)).toBe(iso(REMINDER_INTERVAL_MS - minutes(10)));
  });

  it('is a full interval away on a day nothing has been logged against', () => {
    expect(nextReminderAt(dayWith(), NOW)).toBe(iso(REMINDER_INTERVAL_MS));
  });

  it('is a full interval away when the interval has already elapsed', () => {
    // Five hours without a glass: the user is looking at the app now, so the
    // useful reminder is the next one rather than one already overdue.
    const day = dayWith(-minutes(300));

    expect(nextReminderAt(day, NOW)).toBe(iso(REMINDER_INTERVAL_MS));
  });

  it('uses the interval it is given', () => {
    const day = dayWith(-minutes(10));

    expect(nextReminderAt(day, NOW, minutes(45))).toBe(iso(minutes(35)));
  });

  it('accepts the moment as a Date or an ISO string, to the same answer', () => {
    const day = dayWith(-minutes(20));

    expect(nextReminderAt(day, NOW.toISOString())).toBe(nextReminderAt(day, NOW));
  });
});

describe('once the goal is met', () => {
  it('there is no next reminder', () => {
    const day = dayWith(...Array.from({ length: 5 }, () => -minutes(5)));

    expect(nextReminderAt(day, NOW)).toBeNull();
    expect(planReminder(day, NOW)).toBeNull();
  });

  it('there is none when the goal is exceeded either', () => {
    const day = dayWith(...Array.from({ length: 8 }, () => -minutes(5)));

    expect(planReminder(day, NOW)).toBeNull();
  });

  it('there is one again for a day taken back under its goal', () => {
    // Undo is the ordinary way this happens: the goal was met, and now it is
    // not, so the day has a next reminder again.
    const met = dayWith(...Array.from({ length: 5 }, () => -minutes(5)));
    const undone = { ...met, entries: met.entries.slice(0, -1) };

    expect(planReminder(undone, NOW)).not.toBeNull();
  });
});

describe('the reminder itself', () => {
  it('tells the user to drink, at the moment the interval elapses', () => {
    const reminder = planReminder(dayWith(-minutes(30)), NOW);

    expect(reminder).toEqual({
      title: REMINDER_TITLE,
      body: REMINDER_BODY,
      fireAt: iso(REMINDER_INTERVAL_MS - minutes(30)),
    });
    expect(REMINDER_BODY).toMatch(/water/i);
  });

  it('leaves the day it was planned from untouched', () => {
    const day = dayWith(-minutes(30));
    const before = JSON.stringify(day);

    planReminder(day, NOW);

    expect(JSON.stringify(day)).toBe(before);
  });
});
