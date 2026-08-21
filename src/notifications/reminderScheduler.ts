/**
 * The port every reminder goes through: ask about permission, schedule one
 * notification, cancel one notification.
 *
 * It is deliberately smaller than `expo-notifications`' own API — four
 * methods, no triggers to choose between, no channels — because everything
 * above it is logic that has to be testable without a device. CI has no
 * device, no simulator and no notification permission, so an interface with a
 * fake is what makes the behaviour testable at all rather than an abstraction
 * for its own sake, per docs/architecture.md, "Why interfaces for storage and
 * notifications".
 *
 * Scheduling is local. Nothing here sends anything anywhere: there is no push
 * token, no server and therefore no credential, per docs/technical-spec.md,
 * "Notifications".
 */
import { NotificationPermission } from './permission';
import { Reminder } from './reminder';

/** What `schedule` hands back, and what `cancel` takes. */
export type ReminderId = string;

export interface ReminderScheduler {
  /**
   * Permission as it already stands. This never prompts, so it is safe to call
   * on every launch — asking without prompting is how the app knows whether a
   * previous grant has since been revoked.
   */
  getPermission(): Promise<NotificationPermission>;

  /**
   * Prompts for permission, resolving to the state it settled in. Called at
   * most once ever: a denial is recorded, and a recorded denial stops the app
   * asking again, per docs/functional-spec.md, "Reminders".
   */
  requestPermission(): Promise<NotificationPermission>;

  /**
   * Schedules one notification to fire at `reminder.fireAt`, resolving to the
   * id it can later be cancelled by.
   */
  schedule(reminder: Reminder): Promise<ReminderId>;

  /**
   * Cancels the notification with that id. An id that is not scheduled — one
   * that has already fired, say — is not an error.
   */
  cancel(id: ReminderId): Promise<void>;
}
