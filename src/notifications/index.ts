/**
 * Reminders: one interface, two implementations, and the pure decision about
 * when the next one is due.
 *
 * Every reminder is a local notification scheduled on the device. There is no
 * server, no push service, no token and therefore no credential anywhere here,
 * per docs/technical-spec.md, "Notifications" — and no network request, here
 * or anywhere else in the app.
 *
 * The app builds its scheduler with `createExpoReminderScheduler`; tests build
 * theirs with `createFakeReminderScheduler`. Everything above the interface —
 * when a reminder is due, what cancels it, whether permission allows it — is
 * the same code either way, so a test against the fake is evidence about the
 * phone.
 */
export type { NotificationPermission } from './permission';
export type { QuietHours, TimeOfDay } from './quietHours';
export type { ReminderSettings } from './settings';
export type { Reminder } from './reminder';
export type { ReminderId, ReminderScheduler } from './reminderScheduler';
export type {
  FakeReminderScheduler,
  FakeReminderSchedulerOptions,
  RecordedReminder,
} from './fakeScheduler';
export type { ReminderService, ReminderServiceOptions } from './reminderService';

export {
  DEFAULT_NOTIFICATION_PERMISSION,
  isNotificationPermission,
  NOTIFICATION_PERMISSIONS,
} from './permission';
export {
  assertQuietHours,
  assertTimeOfDay,
  createQuietHours,
  crossesMidnight,
  describeQuietHours,
  isEmptyWindow,
  isQuietHours,
  isTimeOfDay,
  isWithinQuietHours,
  minutesIntoDay,
  outsideQuietHours,
} from './quietHours';
export {
  assertIntervalMs,
  assertReminderSettings,
  createReminderSettings,
  defaultReminderSettings,
  REMINDER_INTERVAL_MS,
  SUGGESTED_QUIET_HOURS,
} from './settings';
export {
  nextReminderAt,
  planReminder,
  REMINDER_BODY,
  REMINDER_TITLE,
} from './reminder';
export { createExpoReminderScheduler } from './expoScheduler';
export { createFakeReminderScheduler } from './fakeScheduler';
export { createReminderService } from './reminderService';
