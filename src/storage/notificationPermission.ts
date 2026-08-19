/**
 * Remembering what the user answered when asked about notifications.
 *
 * docs/functional-spec.md, "Reminders": "If notification permission is denied,
 * the app continues to work fully. The denial is recorded so the user is not
 * asked on every launch." Recorded means stored, so it belongs here, next to
 * the goal and the days, under its own key — writing it never rewrites either
 * of those, per docs/architecture.md, "Storage layout".
 *
 * The three states themselves are `notifications/permission.ts`'s to define:
 * what a permission *is* is a question about notifications, and storage only
 * files the answer away. That module imports nothing at all, so depending on
 * it costs this layer no platform dependency.
 *
 * Reading tolerates everything a real device accumulates — absent, empty,
 * truncated, hand-edited, or written by a later version of the app — and
 * yields `'undetermined'`, the state before anyone was asked. Nobody is
 * treated as having granted or refused on the strength of a value that could
 * not be read.
 */
import {
  DEFAULT_NOTIFICATION_PERMISSION,
  isNotificationPermission,
  NotificationPermission,
} from '../notifications/permission';
import { NOTIFICATION_PERMISSION_KEY } from './keys';
import { KeyValueStore } from './keyValueStore';

export interface NotificationPermissionStorage {
  /**
   * The recorded answer, or `'undetermined'` when nothing readable is stored.
   * Never throws.
   */
  readNotificationPermission(): Promise<NotificationPermission>;

  /**
   * Records the answer, replacing any previous one. Throws `TypeError` for a
   * value that is not one of the three states, so an unreadable record cannot
   * be created by this app.
   */
  writeNotificationPermission(permission: NotificationPermission): Promise<void>;
}

/** Encodes the recorded answer. Throws `TypeError` if it is not one of the three. */
export function encodeNotificationPermission(permission: NotificationPermission): string {
  if (!isNotificationPermission(permission)) {
    throw new TypeError(
      `A notification permission must be one of the recognised states, received ${String(
        permission,
      )}`,
    );
  }

  // An object rather than a bare word, so a later version can add a field —
  // when it was answered, say — without the old records becoming unreadable.
  return JSON.stringify({ permission });
}

/**
 * Decodes the recorded answer, falling back to `'undetermined'` for anything
 * unreadable.
 */
export function decodeNotificationPermission(raw: string | null): NotificationPermission {
  if (raw === null || raw.trim() === '') {
    return DEFAULT_NOTIFICATION_PERMISSION;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const candidate = (parsed as { permission?: unknown } | null)?.permission;

    return isNotificationPermission(candidate) ? candidate : DEFAULT_NOTIFICATION_PERMISSION;
  } catch {
    return DEFAULT_NOTIFICATION_PERMISSION;
  }
}

/**
 * Builds the record over any key-value store. The store is the only thing that
 * differs between the device and a test.
 */
export function createNotificationPermissionStorage(
  store: KeyValueStore,
): NotificationPermissionStorage {
  return {
    async readNotificationPermission(): Promise<NotificationPermission> {
      return decodeNotificationPermission(await store.read(NOTIFICATION_PERMISSION_KEY));
    },

    async writeNotificationPermission(permission: NotificationPermission): Promise<void> {
      // Encoded before the write so an invalid state throws instead of landing
      // in storage half-formed.
      await store.write(NOTIFICATION_PERMISSION_KEY, encodeNotificationPermission(permission));
    },
  };
}
