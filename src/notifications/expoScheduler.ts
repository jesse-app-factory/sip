/**
 * The device implementation: `expo-notifications` behind the same interface as
 * the fake.
 *
 * This is the only file in the app that imports `expo-notifications`, and it is
 * deliberately the thinnest thing that could work — four methods, no logic,
 * nothing to get wrong. When the next reminder is due and whether one is due at
 * all are decided in `reminder.ts` and `reminderService.ts`, where they are
 * tested against the fake, per docs/architecture.md.
 *
 * Everything here is local to the device. The notification is handed to the
 * operating system's scheduler with a date trigger; nothing is sent anywhere,
 * no push token is requested, and no network call is made — see
 * docs/technical-spec.md, "Notifications".
 */
import * as Notifications from 'expo-notifications';

import { isNotificationPermission, NotificationPermission } from './permission';
import { Reminder } from './reminder';
import { ReminderId, ReminderScheduler } from './reminderScheduler';

/** The `expo-notifications` calls this app uses, and nothing else. */
interface NotificationsLike {
  getPermissionsAsync(): Promise<{ status: string }>;
  requestPermissionsAsync(): Promise<{ status: string }>;
  scheduleNotificationAsync(request: Notifications.NotificationRequestInput): Promise<string>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
}

/**
 * The platform reports the same three words this app stores, so the mapping is
 * a check rather than a translation. Anything unrecognised is treated as "not
 * asked yet", which prompts rather than assuming a grant nobody made.
 */
function toPermission(status: string): NotificationPermission {
  return isNotificationPermission(status) ? status : 'undetermined';
}

/**
 * Adapts `expo-notifications` to the scheduler interface. The parameter exists
 * so the adapter can be handed a stand-in; the app calls it with no argument.
 */
export function createExpoReminderScheduler(
  notifications: NotificationsLike = Notifications,
): ReminderScheduler {
  return {
    async getPermission(): Promise<NotificationPermission> {
      return toPermission((await notifications.getPermissionsAsync()).status);
    },

    async requestPermission(): Promise<NotificationPermission> {
      return toPermission((await notifications.requestPermissionsAsync()).status);
    },

    schedule(reminder: Reminder): Promise<ReminderId> {
      return notifications.scheduleNotificationAsync({
        content: { title: reminder.title, body: reminder.body },
        // A date trigger rather than an interval one: the fire time is already
        // decided, and an interval would drift by however long the scheduling
        // itself took.
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(reminder.fireAt),
        },
      });
    },

    cancel(id: ReminderId): Promise<void> {
      return notifications.cancelScheduledNotificationAsync(id);
    },
  };
}
