/**
 * A logged glass: an amount in millilitres and the moment it was logged.
 *
 * An entry carries no identifier. Generating one would need randomness or a
 * clock, and the only operation that singles an entry out is undo, which wants
 * the most recent one — a position, not a name.
 */
import { assertMillilitres } from './millilitres';
import { IsoTimestamp, toIsoTimestamp } from './time';

export interface Entry {
  readonly amountMl: number;
  /** ISO 8601, per docs/functional-spec.md, "Logging". */
  readonly loggedAt: IsoTimestamp;
}

/**
 * Creates an entry, throwing `TypeError` for an invalid amount or an
 * unparseable moment. The moment is passed in rather than read from the clock
 * so tests can control it.
 */
export function createEntry(amountMl: number, loggedAt: Date | string): Entry {
  assertMillilitres(amountMl, 'An entry amount');

  return { amountMl, loggedAt: toIsoTimestamp(loggedAt, 'An entry timestamp') };
}

/** Narrows an unknown value to an `Entry`, throwing `TypeError` if it is not. */
export function assertEntry(value: unknown): asserts value is Entry {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`An entry must be an object, received ${typeof value}`);
  }

  const candidate = value as { amountMl?: unknown; loggedAt?: unknown };
  assertMillilitres(candidate.amountMl, 'An entry amount');
  toIsoTimestamp(candidate.loggedAt, 'An entry timestamp');
}

/** Orders entries oldest first, so the most recent one is always last. */
export function compareEntries(a: Entry, b: Entry): number {
  return Date.parse(a.loggedAt) - Date.parse(b.loggedAt);
}
