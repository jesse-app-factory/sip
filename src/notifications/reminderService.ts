/**
 * Keeping the device's one pending reminder in line with the day.
 *
 * docs/architecture.md, "Data flow, a reminder": "Reminders are not a loop or
 * a background service. Each time an entry is logged, the next reminder is
 * scheduled and the previous one cancelled. At most one reminder is pending at
 * any moment." That invariant is this file's whole job — `sync` cancels
 * whatever is pending and schedules whatever is now due, so the two can never
 * drift apart.
 *
 * What is due is `reminder.ts`'s pure decision; how it is scheduled is the
 * `ReminderScheduler`'s; whether the app may schedule at all is the recorded
 * permission's. This is only the ordering between them.
 *
 * ## Settings are read, never remembered
 *
 * The interval, the quiet-hours window and the off switch are read from
 * storage on every sync. Nothing therefore has to tell the service that a
 * setting changed: the settings screen stores the new value and syncs, and
 * because `sync` cancels before it reads, an interval that moved reschedules
 * the pending reminder and an off switch leaves nothing pending at all.
 *
 * ## Permission is asked at most once
 *
 * docs/functional-spec.md, "Reminders": a denial is recorded "so the user is
 * not asked on every launch". So a recorded denial short-circuits before the
 * platform is touched, and the prompt itself only happens in the one state
 * that has never been answered. A grant is re-checked without prompting each
 * time, because permission revoked in the operating system's settings is a
 * state the app should notice.
 *
 * ## Nothing here may crash the app
 *
 * A denied permission is a supported state, not an error path, per
 * docs/technical-spec.md, "Error handling" — and neither is a platform that
 * refuses to schedule. Every call is contained: `sync` resolves with `null`
 * rather than rejecting, so a screen that logs a glass cannot be brought down
 * by the notification system.
 *
 * ## Calls are serialised
 *
 * Two glasses logged in quick succession are two syncs. Left to interleave,
 * the second could schedule before the first cancelled, leaving two reminders
 * pending. They are queued instead, so the cancel-then-schedule pair is never
 * split.
 */
import { Day } from '../domain';
import type { NotificationPermissionStorage } from '../storage/notificationPermission';
import type { ReminderSettingsStorage } from '../storage/reminderSettings';
import { planReminder, Reminder } from './reminder';
import { ReminderId, ReminderScheduler } from './reminderScheduler';

export interface ReminderService {
  /**
   * Brings the pending reminder into line with this day as of `now`: cancels
   * whatever was pending, and schedules the next one unless the settings, the
   * day or the permission say there is none.
   *
   * Resolves with the reminder that was scheduled, or `null` when none was —
   * reminders switched off, goal met, permission refused, or the platform
   * refused the call. It never rejects.
   */
  sync(day: Day, now: Date | string): Promise<Reminder | null>;

  /**
   * Cancels anything pending and schedules nothing. Resolves once there is no
   * reminder pending, and never rejects.
   */
  cancelPending(): Promise<void>;
}

export interface ReminderServiceOptions {
  /** Where reminders are scheduled: the device one, or the fake. */
  readonly scheduler: ReminderScheduler;

  /** Where the user's answer about permission is recorded. */
  readonly permissions: NotificationPermissionStorage;

  /**
   * Where the interval, the quiet hours and the off switch are stored. Read on
   * every sync rather than held, so a setting changed on the settings screen
   * governs the very next reminder without anything having to be told about
   * it.
   */
  readonly settings: ReminderSettingsStorage;
}

export function createReminderService({
  scheduler,
  permissions,
  settings,
}: ReminderServiceOptions): ReminderService {
  let pendingId: ReminderId | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  /** Runs `work` after everything already queued, answering `fallback` if it throws. */
  function enqueue<T>(work: () => Promise<T>, fallback: T): Promise<T> {
    const run = queue.then(work).catch(() => fallback);
    queue = run;

    return run;
  }

  async function cancel(): Promise<void> {
    if (pendingId === null) {
      return;
    }

    const id = pendingId;
    // Forgotten before the call rather than after it: a cancel that fails must
    // not leave an id behind that every later sync tries to cancel again.
    pendingId = null;

    try {
      await scheduler.cancel(id);
    } catch {
      // The reminder may well still be pending, but there is nothing useful to
      // do about it and nothing here is worth failing a logged glass over.
    }
  }

  /**
   * Whether a notification may be scheduled, asking the user at most once ever
   * and recording what they answered.
   */
  async function allowed(): Promise<boolean> {
    const recorded = await permissions.readNotificationPermission();

    if (recorded === 'denied') {
      // The whole point of recording it: the platform is not consulted, so no
      // prompt can appear, however many times the app is opened.
      return false;
    }

    const current = await scheduler.getPermission();
    const settled =
      current === 'undetermined' ? await scheduler.requestPermission() : current;

    if (settled !== recorded) {
      await permissions.writeNotificationPermission(settled);
    }

    return settled === 'granted';
  }

  return {
    sync(day: Day, now: Date | string): Promise<Reminder | null> {
      return enqueue(async () => {
        // Cancelled before anything else, so at most one reminder is pending
        // even if this sync goes on to schedule nothing.
        await cancel();

        // Read rather than remembered, so switching reminders off cancels what
        // was pending on the very next sync, and a new interval or window is
        // in force from the moment it is stored.
        const next = planReminder(day, now, await settings.readReminderSettings());
        if (next === null) {
          // Reminders are off, or the goal is met and nothing further is
          // scheduled today, per docs/functional-spec.md, "Reminders". Either
          // way the cancel above has already left nothing pending.
          return null;
        }

        if (!(await allowed())) {
          return null;
        }

        pendingId = await scheduler.schedule(next);

        return next;
      }, null);
    },

    cancelPending(): Promise<void> {
      return enqueue(cancel, undefined);
    },
  };
}
