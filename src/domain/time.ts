/**
 * The time primitives the rest of the domain is built from.
 *
 * Nothing here reads the clock. Every function takes the moment it needs as an
 * argument, because the day-boundary behaviour is otherwise untestable without
 * waiting until midnight — see docs/technical-spec.md, "Time".
 *
 * Days are identified by their local date, and timestamps are stored as ISO
 * 8601 strings so a day survives being written to storage and read back as
 * JSON without a bespoke encoding.
 */

/** `YYYY-MM-DD`, in the device's local time zone. */
export type LocalDate = string;

/** An ISO 8601 timestamp, as produced by `Date.prototype.toISOString`. */
export type IsoTimestamp = string;

/**
 * Accepts a date-only key or a full ISO 8601 timestamp. Anything looser — a
 * bare year, `"tomorrow"`, a locale format — is rejected, so a value that
 * reached storage cannot be read back as a different moment than it was
 * written.
 */
const ISO_LIKE =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Narrows an unknown value to a moment in time, throwing `TypeError` for
 * anything that is not a valid `Date` or ISO 8601 string.
 *
 * @param label how the value is named in the error message
 */
export function toInstant(value: unknown, label: string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError(`${label} must be a valid Date, received an invalid one`);
    }
    return new Date(value.getTime());
  }

  if (typeof value === 'string' && ISO_LIKE.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  throw new TypeError(
    `${label} must be a Date or an ISO 8601 string, received ${
      typeof value === 'string' ? JSON.stringify(value) : String(value)
    }`,
  );
}

/** Formats a moment as an ISO 8601 timestamp. */
export function toIsoTimestamp(value: unknown, label: string): IsoTimestamp {
  return toInstant(value, label).toISOString();
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

/**
 * The local date a moment falls on. Built from the local getters rather than
 * from `toISOString`, which would report the UTC date and so put late-evening
 * entries on tomorrow for anyone east of Greenwich.
 */
export function toLocalDate(value: unknown, label = 'A date'): LocalDate {
  if (typeof value === 'string' && LOCAL_DATE.test(value)) {
    // Already a local date key. Round-tripping it through `Date` would read it
    // as UTC midnight and shift it a day backwards in western time zones.
    assertLocalDate(value, label);
    return value;
  }

  const instant = toInstant(value, label);

  return `${pad(instant.getFullYear(), 4)}-${pad(instant.getMonth() + 1, 2)}-${pad(
    instant.getDate(),
    2,
  )}`;
}

/**
 * The local date `days` before or after another. A negative `days` moves
 * backwards, which is how history walks from today into the past.
 *
 * The arithmetic is handed to `Date` on the day of the month, so month ends,
 * year ends and leap days are its problem rather than this function's. It is
 * done at local midnight rather than by adding a multiple of 24 hours because a
 * local day is not always 24 hours long: the hour lost or gained to daylight
 * saving would otherwise land the result on the wrong date twice a year.
 */
export function shiftLocalDate(date: LocalDate, days: number, label = 'A date'): LocalDate {
  assertLocalDate(date, label);

  if (!Number.isInteger(days)) {
    throw new TypeError(
      `A number of days to shift by must be a whole number, received ${String(days)}`,
    );
  }

  const [year, month, dayOfMonth] = date.split('-').map(Number);

  return toLocalDate(new Date(year, month - 1, dayOfMonth + days), label);
}

/** Narrows an unknown value to a real `YYYY-MM-DD` local date. */
export function assertLocalDate(
  value: unknown,
  label = 'A date',
): asserts value is LocalDate {
  if (typeof value !== 'string' || !LOCAL_DATE.test(value)) {
    throw new TypeError(
      `${label} must be a YYYY-MM-DD local date, received ${
        typeof value === 'string' ? JSON.stringify(value) : String(value)
      }`,
    );
  }

  const [year, month, day] = value.split('-').map(Number);
  const asDate = new Date(year, month - 1, day);
  const isReal =
    asDate.getFullYear() === year &&
    asDate.getMonth() === month - 1 &&
    asDate.getDate() === day;

  if (!isReal) {
    throw new TypeError(`${label} must be a real calendar date, received "${value}"`);
  }
}
