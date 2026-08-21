/**
 * What the user controls about reminders: how often, when not to, and whether
 * at all.
 *
 * TASK-008 built the reminder behaviour with fixed values, and the plan says
 * why: "TASK-008 builds the scheduling behaviour with fixed values; TASK-009
 * makes those values configurable." This module is where those values now
 * live, as one plain record.
 *
 * It is deliberately dependency-free beyond `quietHours.ts` — no storage, no
 * React, no platform import. Settings are a value; storing them is
 * `storage/reminderSettings.ts`'s job and acting on them is `reminder.ts`'s,
 * and neither can drift from the other on what a valid setting is because both
 * come here for it.
 *
 * ## The three settings, and their defaults
 *
 * | Setting      | Default        | Meaning                                    |
 * | ------------ | -------------- | ------------------------------------------ |
 * | `enabled`    | `true`         | whether any reminder is scheduled at all    |
 * | `intervalMs` | two hours      | how long without a glass before a reminder  |
 * | `quietHours` | `null`         | a window no reminder may fire inside        |
 *
 * `quietHours` defaults to none rather than to an evening window because a
 * default window would quietly suppress reminders the user did configure. The
 * settings screen offers `SUGGESTED_QUIET_HOURS` when the user turns quiet
 * hours on, so the common 22:00 to 07:00 window is one press away without
 * being imposed.
 *
 * `enabled` defaults to `true` so that reminders behave as TASK-008 built them
 * until the user says otherwise. Onboarding is what switches them off for a
 * user who skips it, per docs/functional-spec.md, "First run".
 */
import { assertQuietHours, createQuietHours, QuietHours } from './quietHours';

/**
 * How long without a glass before the user is reminded, unless they choose
 * otherwise. Two hours: often enough to matter across a working day, rare
 * enough not to be a nuisance.
 */
export const REMINDER_INTERVAL_MS = 2 * 60 * 60 * 1000;

/**
 * The window offered when quiet hours are switched on: the night, and the one
 * that crosses midnight, because the reason quiet hours exist at all is that
 * an app which wakes someone at three in the morning gets deleted.
 */
export const SUGGESTED_QUIET_HOURS: QuietHours = createQuietHours('22:00', '07:00');

/** Everything the user controls about reminders. */
export interface ReminderSettings {
  /** Whether any reminder is scheduled at all. */
  readonly enabled: boolean;

  /** How long after the most recent glass a reminder is due. */
  readonly intervalMs: number;

  /** The window no reminder may fire inside, or `null` for none. */
  readonly quietHours: QuietHours | null;
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

/** Narrows an unknown value to settings, throwing `TypeError` if it is not. */
export function assertReminderSettings(value: unknown): asserts value is ReminderSettings {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`Reminder settings must be an object, received ${typeof value}`);
  }

  const candidate = value as { enabled?: unknown; intervalMs?: unknown; quietHours?: unknown };

  if (typeof candidate.enabled !== 'boolean') {
    throw new TypeError(
      `Reminders are either on or off, received ${typeof candidate.enabled}`,
    );
  }

  assertIntervalMs(candidate.intervalMs);

  if (candidate.quietHours !== null) {
    assertQuietHours(candidate.quietHours);
  }
}

/**
 * The settings a user who has changed nothing gets, as its own value so no
 * caller can hand another one a window it then edits.
 */
export function defaultReminderSettings(): ReminderSettings {
  return { enabled: true, intervalMs: REMINDER_INTERVAL_MS, quietHours: null };
}

/**
 * Settings built from a change to some other settings, throwing `TypeError`
 * for a value that could not be acted on. Rebuilt field by field, so nothing
 * an older or newer version of the app wrote travels any further.
 */
export function createReminderSettings(
  settings: Partial<ReminderSettings> = {},
): ReminderSettings {
  const next = { ...defaultReminderSettings(), ...settings };
  assertReminderSettings(next);

  return {
    enabled: next.enabled,
    intervalMs: next.intervalMs,
    quietHours:
      next.quietHours === null
        ? null
        : createQuietHours(next.quietHours.start, next.quietHours.end),
  };
}
