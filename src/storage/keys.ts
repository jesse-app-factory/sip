/**
 * The keys the app stores values under.
 *
 * The goal and each day get their own key, with days keyed by local date, so
 * that writing today never rewrites yesterday — see docs/architecture.md,
 * "Storage layout". A single blob holding every day would make a bug in
 * today's write path capable of destroying history; separate keys make that
 * impossible rather than unlikely.
 *
 * Keys are namespaced because AsyncStorage is a single store shared with
 * anything else running in the app.
 */
import { assertLocalDate, LocalDate } from '../domain';

/** Prefixes every key this app owns. */
export const KEY_PREFIX = 'sip:';

/** The one key holding the current daily goal. */
export const GOAL_KEY = `${KEY_PREFIX}goal`;

/** Prefixes the per-day keys, so a day key is recognisable on sight. */
export const DAY_KEY_PREFIX = `${KEY_PREFIX}day:`;

/**
 * The one key holding what the user answered about notification permission,
 * recorded so they are not asked again on every launch — see
 * docs/functional-spec.md, "Reminders".
 */
export const NOTIFICATION_PERMISSION_KEY = `${KEY_PREFIX}notificationPermission`;

/**
 * The key a day is stored under, throwing `TypeError` for anything that is not
 * a real `YYYY-MM-DD` local date. A malformed date would otherwise create a
 * key nothing ever reads back, losing the day silently.
 */
export function dayKey(date: LocalDate): string {
  assertLocalDate(date, 'A day key');

  return `${DAY_KEY_PREFIX}${date}`;
}
