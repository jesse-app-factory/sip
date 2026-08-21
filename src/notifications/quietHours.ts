/**
 * The window no reminder may fire inside, and the arithmetic for moving a fire
 * time out of it.
 *
 * docs/technical-spec.md, "Notifications": "Quiet hours are enforced when
 * scheduling, by choosing a fire time outside the window. They are not
 * enforced by dismissing a notification after it arrives." So this module
 * answers one question — where does this moment sit relative to the window —
 * and the answer is used before anything is handed to the platform.
 *
 * ## Crossing midnight is the ordinary case
 *
 * docs/functional-spec.md: "Quiet hours may cross midnight — 22:00 to 07:00 is
 * a valid window and must be treated as one continuous period, not an empty
 * one." A window is therefore a pair of times of day rather than a pair of
 * instants, and whether it wraps is decided by comparing them: 22:00 to 07:00
 * is every minute from 22:00 to the end of the day plus every minute from
 * midnight to 07:00. Treating `start > end` as an empty range is the bug this
 * module exists to make impossible, and `__tests__/notifications/quietHours`
 * names it.
 *
 * ## Local time, and no clock
 *
 * "All dates are local", per docs/technical-spec.md, "Time", so 22:00 means
 * ten at night where the user is standing. Every function takes the moment it
 * works on as an argument and none reads the clock, which is what makes a
 * window crossing midnight testable without waiting until midnight.
 */

/** `HH:MM`, in the device's local time zone, on the 24-hour clock. */
export type TimeOfDay = string;

/**
 * A window of the day. Both ends are times of day rather than instants,
 * because the window applies to every day rather than to one of them.
 *
 * The start is inside the window and the end is not: a reminder due at exactly
 * the end is the first one allowed through, which is what makes moving a fire
 * time to the end of the window a resolution rather than a loop.
 */
export interface QuietHours {
  readonly start: TimeOfDay;
  readonly end: TimeOfDay;
}

/** Deliberately strict: `7:00`, `07:60` and `24:00` are all refused. */
const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Narrows an unknown value — stored, or typed — to a time of day. */
export function isTimeOfDay(value: unknown): value is TimeOfDay {
  return typeof value === 'string' && TIME_OF_DAY.test(value);
}

/**
 * Narrows an unknown value to a time of day, throwing `TypeError` otherwise.
 *
 * @param label how the value is named in the error message
 */
export function assertTimeOfDay(value: unknown, label: string): asserts value is TimeOfDay {
  if (!isTimeOfDay(value)) {
    throw new TypeError(
      `${label} must be a time of day as HH:MM, received ${
        typeof value === 'string' ? JSON.stringify(value) : String(value)
      }`,
    );
  }
}

/** Narrows an unknown value to a window, throwing `TypeError` otherwise. */
export function assertQuietHours(value: unknown): asserts value is QuietHours {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`Quiet hours must be an object, received ${typeof value}`);
  }

  const candidate = value as { start?: unknown; end?: unknown };
  assertTimeOfDay(candidate.start, 'A quiet hours start');
  assertTimeOfDay(candidate.end, 'A quiet hours end');
}

/** Narrows an unknown value to a window without throwing. */
export function isQuietHours(value: unknown): value is QuietHours {
  try {
    assertQuietHours(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a window, throwing `TypeError` for anything that is not a pair of
 * `HH:MM` times. Rebuilt rather than returned as given, so no extra field
 * travels any further into the app.
 */
export function createQuietHours(start: TimeOfDay, end: TimeOfDay): QuietHours {
  assertTimeOfDay(start, 'A quiet hours start');
  assertTimeOfDay(end, 'A quiet hours end');

  return { start, end };
}

/** Minutes from local midnight, so two times of day can be compared as numbers. */
export function minutesIntoDay(time: TimeOfDay): number {
  assertTimeOfDay(time, 'A time of day');

  const [hours, minutes] = time.split(':').map(Number);

  return hours * 60 + minutes;
}

/**
 * True when the window wraps past midnight — 22:00 to 07:00 — and so covers
 * the end of one day and the start of the next.
 */
export function crossesMidnight(quietHours: QuietHours): boolean {
  return minutesIntoDay(quietHours.start) > minutesIntoDay(quietHours.end);
}

/**
 * Whether the window covers no time at all, which is the case for a start and
 * an end that are the same minute.
 *
 * That could as easily mean the whole day, but a whole day of quiet is "no
 * reminder ever", which switching reminders off says plainly and cancels
 * pending ones for. Reading it as an empty window keeps "switched on" from
 * silently meaning "never".
 */
export function isEmptyWindow(quietHours: QuietHours): boolean {
  return minutesIntoDay(quietHours.start) === minutesIntoDay(quietHours.end);
}

/**
 * Whether that moment falls inside the window, in local time. `null` — no
 * quiet hours configured — is never inside anything.
 *
 * The start is included and the end excluded, and a window that wraps past
 * midnight is one continuous period rather than an empty one.
 */
export function isWithinQuietHours(quietHours: QuietHours | null, at: Date): boolean {
  if (quietHours === null) {
    return false;
  }

  assertQuietHours(quietHours);

  if (isEmptyWindow(quietHours)) {
    return false;
  }

  const minute = at.getHours() * 60 + at.getMinutes();
  const start = minutesIntoDay(quietHours.start);
  const end = minutesIntoDay(quietHours.end);

  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/**
 * The first moment at or after `at` that is outside the window: `at` itself
 * when it is already outside, and the end of the window when it is not.
 *
 * The end is found in local time by building it on the same local day and
 * moving to the next one if that has already passed — which is exactly the
 * case for a window crossing midnight entered before midnight. Building it
 * from the local date rather than by adding milliseconds is what keeps 07:00
 * meaning seven in the morning across a daylight-saving change.
 */
export function outsideQuietHours(quietHours: QuietHours | null, at: Date): Date {
  if (quietHours === null || !isWithinQuietHours(quietHours, at)) {
    return new Date(at.getTime());
  }

  const end = minutesIntoDay(quietHours.end);
  const sameDay = localTime(at, 0, end);

  // The end has already passed today, so the window this moment is inside is
  // the one that ends tomorrow morning — the midnight-crossing case.
  return sameDay.getTime() > at.getTime() ? sameDay : localTime(at, 1, end);
}

/** That many minutes into the local day `dayOffset` days after `at`. */
function localTime(at: Date, dayOffset: number, minute: number): Date {
  return new Date(
    at.getFullYear(),
    at.getMonth(),
    at.getDate() + dayOffset,
    Math.floor(minute / 60),
    minute % 60,
    0,
    0,
  );
}

/** How a window reads on screen, and in a test. */
export function describeQuietHours(quietHours: QuietHours): string {
  return `${quietHours.start} to ${quietHours.end}`;
}
