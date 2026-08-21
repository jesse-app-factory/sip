/**
 * The fake implementation: a list behind the same interface as the device
 * scheduler.
 *
 * Every test in the project uses this one. CI has no device and no
 * notification permission, so a test reaching `expo-notifications` could not
 * pass there — see docs/testing-strategy.md, "The constraint that shapes
 * everything". Nothing here is scheduled with the operating system and no
 * permission prompt is ever shown; the fake only records what *would* have
 * been scheduled, which is exactly what the notification tests assert on.
 *
 * The prompt is modelled rather than skipped: the fake starts in a permission
 * state, reports it, and settles on another when asked. That is what makes
 * "the user denied it, and is never asked again" something a test can observe.
 */
import { NotificationPermission } from './permission';
import { Reminder } from './reminder';
import { ReminderId, ReminderScheduler } from './reminderScheduler';

/** A reminder as the fake holds it: what was asked for, and under which id. */
export interface RecordedReminder extends Reminder {
  readonly id: ReminderId;
}

export interface FakeReminderScheduler extends ReminderScheduler {
  /** Everything ever scheduled, oldest first, cancelled or not. */
  all(): RecordedReminder[];

  /** What the device would still be holding: scheduled and not cancelled. */
  pending(): RecordedReminder[];

  /** The ids cancelled, in the order they were cancelled. */
  cancelled(): ReminderId[];

  /** How many times the user was prompted — the number that must not grow. */
  prompts(): number;

  /** The state the platform would report now, as the user changing settings. */
  setPermission(permission: NotificationPermission): void;
}

export interface FakeReminderSchedulerOptions {
  /** What the platform reports before anything is asked. */
  readonly permission?: NotificationPermission;

  /** What a prompt settles on — `'denied'` for a user who refuses. */
  readonly whenPrompted?: NotificationPermission;
}

/**
 * A scheduler holding nothing, starting in `permission` and settling on
 * `whenPrompted` if asked. Each call returns its own, so no test can leak
 * state into another.
 */
export function createFakeReminderScheduler({
  permission = 'undetermined',
  whenPrompted = 'granted',
}: FakeReminderSchedulerOptions = {}): FakeReminderScheduler {
  const scheduled: RecordedReminder[] = [];
  const cancelled: ReminderId[] = [];
  let current = permission;
  let prompts = 0;
  let nextId = 0;

  return {
    async getPermission(): Promise<NotificationPermission> {
      return current;
    },

    async requestPermission(): Promise<NotificationPermission> {
      prompts += 1;
      current = whenPrompted;

      return current;
    },

    async schedule(reminder: Reminder): Promise<ReminderId> {
      nextId += 1;
      const id = `reminder-${nextId}`;
      scheduled.push({ ...reminder, id });

      return id;
    },

    async cancel(id: ReminderId): Promise<void> {
      // An id that was never scheduled is not an error here either: the device
      // treats an already-fired notification the same way.
      cancelled.push(id);
    },

    all(): RecordedReminder[] {
      return [...scheduled];
    },

    pending(): RecordedReminder[] {
      return scheduled.filter((reminder) => !cancelled.includes(reminder.id));
    },

    cancelled(): ReminderId[] {
      return [...cancelled];
    },

    prompts(): number {
      return prompts;
    },

    setPermission(permission: NotificationPermission): void {
      current = permission;
    },
  };
}
