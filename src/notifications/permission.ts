/**
 * Whether the app may show a notification at all, as the three states every
 * platform reports: never asked, allowed, refused.
 *
 * This module is deliberately dependency-free — no platform import, no
 * storage, no React. It is the one definition of the three states, so the
 * scheduler that reports them, the storage that files the answer away and the
 * service that acts on it cannot drift apart on what "denied" is spelled.
 *
 * The values are the ones `expo-notifications` itself reports, so the real
 * scheduler maps its answer onto these without a translation table that could
 * be wrong.
 *
 * A denial is a supported state rather than an error path, per
 * docs/technical-spec.md, "Error handling": the app keeps working, and the
 * denial is remembered so the user is not asked again on every launch.
 */

/** Never asked, allowed, or refused. */
export type NotificationPermission = 'undetermined' | 'granted' | 'denied';

/** Every valid state, so a decoder can check a stored value against one list. */
export const NOTIFICATION_PERMISSIONS: readonly NotificationPermission[] = [
  'undetermined',
  'granted',
  'denied',
];

/**
 * What the app assumes before anything has been asked or stored: nobody has
 * been asked yet.
 */
export const DEFAULT_NOTIFICATION_PERMISSION: NotificationPermission = 'undetermined';

/** Narrows an unknown value — a stored string, a platform answer — to a state. */
export function isNotificationPermission(value: unknown): value is NotificationPermission {
  return (
    typeof value === 'string' &&
    NOTIFICATION_PERMISSIONS.includes(value as NotificationPermission)
  );
}
