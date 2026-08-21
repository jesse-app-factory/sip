/**
 * Persistence: one interface, two implementations, and the encoding they
 * share.
 *
 * Everything the app stores is on the device. There is no account, no
 * synchronisation and no network request anywhere here or anywhere else in the
 * app, per docs/functional-spec.md, "Data".
 *
 * The app builds its storage with `createAsyncStorageHydrationStorage`; tests
 * build theirs with `createInMemoryHydrationStorage`. Both are
 * `createHydrationStorage` over a `KeyValueStore`, so the logic under test is
 * the logic that runs on the phone.
 */
export type { History, ReadHistoryOptions } from './history';
export type { HydrationStorage } from './hydrationStorage';
export type { KeyValueStore } from './keyValueStore';
export type { InMemoryKeyValueStore } from './inMemory';
export type { NotificationPermissionStorage } from './notificationPermission';
export type { OnboardingOutcome, OnboardingState, OnboardingStorage } from './onboarding';
export type { ReminderSettingsStorage } from './reminderSettings';

export { createHydrationStorage } from './hydrationStorage';
export { MAX_STREAK_DAYS, readHistory } from './history';
export { createInMemoryHydrationStorage, createInMemoryKeyValueStore } from './inMemory';
export {
  createAsyncStorageHydrationStorage,
  createAsyncStorageKeyValueStore,
  createAsyncStorageNotificationPermissionStorage,
  createAsyncStorageOnboardingStorage,
  createAsyncStorageReminderSettingsStorage,
} from './asyncStorage';
export {
  createNotificationPermissionStorage,
  decodeNotificationPermission,
  encodeNotificationPermission,
} from './notificationPermission';
export {
  createOnboardingStorage,
  decodeOnboarding,
  DEFAULT_ONBOARDING_STATE,
  encodeOnboarding,
  isOnboardingOutcome,
  ONBOARDING_OUTCOMES,
} from './onboarding';
export {
  createReminderSettingsStorage,
  decodeReminderSettings,
  encodeReminderSettings,
} from './reminderSettings';
export {
  DAY_KEY_PREFIX,
  dayKey,
  GOAL_KEY,
  KEY_PREFIX,
  NOTIFICATION_PERMISSION_KEY,
  ONBOARDING_KEY,
  REMINDER_SETTINGS_KEY,
} from './keys';
export { decodeDay, decodeGoal, encodeDay, encodeGoal } from './records';
