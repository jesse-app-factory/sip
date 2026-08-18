/**
 * A day: the local date, the goal that applied on it, and the entries logged
 * against it — plus the arithmetic over them.
 *
 * The day carries its own goal because docs/functional-spec.md requires that
 * "each day retains the goal that applied on that day": raising today's goal
 * must not turn a past success into a failure.
 *
 * Every function that changes a day returns a new value and leaves its
 * argument untouched, per docs/technical-spec.md, "Purity of the domain
 * layer".
 */
import { assertEntry, compareEntries, Entry } from './entry';
import { assertGoal, Goal } from './goal';
import { LocalDate, toInstant, toLocalDate } from './time';

export interface Day {
  readonly date: LocalDate;
  readonly goal: Goal;
  /** Ordered oldest first, so the most recent entry is always last. */
  readonly entries: readonly Entry[];
}

/**
 * Creates a day. Entries are optional — a day that has been started but not
 * logged against is the normal state at local midnight — and are copied and
 * ordered, so the caller's array cannot later change the day.
 */
export function createDay(
  date: Date | LocalDate,
  goal: Goal,
  entries: readonly Entry[] = [],
): Day {
  assertGoal(goal);

  if (!Array.isArray(entries)) {
    throw new TypeError(`A day's entries must be an array, received ${typeof entries}`);
  }
  entries.forEach(assertEntry);

  return {
    date: toLocalDate(date, "A day's date"),
    goal,
    entries: [...entries].sort(compareEntries),
  };
}

/**
 * Adds an entry, returning a new day. The day passed in is not modified, and
 * neither is its entry array.
 */
export function addEntry(day: Day, entry: Entry): Day {
  assertEntry(entry);

  return { ...day, entries: [...day.entries, entry].sort(compareEntries) };
}

/**
 * Removes the most recent entry, returning a new day. A day with no entries is
 * returned unchanged as a new value: undo on an empty day does nothing and
 * raises no error, per docs/functional-spec.md, "Logging".
 */
export function undoLastEntry(day: Day): Day {
  return { ...day, entries: day.entries.slice(0, -1) };
}

/** The most recent entry, or `null` for a day with no entries. */
export function lastEntry(day: Day): Entry | null {
  return day.entries.length === 0 ? null : day.entries[day.entries.length - 1];
}

/** The day's total in millilitres. Zero for a day with no entries. */
export function totalMl(day: Day): number {
  return day.entries.reduce((sum, entry) => sum + entry.amountMl, 0);
}

/**
 * How much of the goal is left, never below zero — exceeding the goal leaves
 * nothing remaining rather than a negative amount to display.
 */
export function remainingMl(day: Day): number {
  return Math.max(0, day.goal.amountMl - totalMl(day));
}

/**
 * The day's total divided by its goal, clamped to a maximum of 1. Zero for a
 * day with no entries.
 */
export function progress(day: Day): number {
  return Math.min(1, totalMl(day) / day.goal.amountMl);
}

/** True when the total is greater than or equal to the day's goal. */
export function isGoalMet(day: Day): boolean {
  return totalMl(day) >= day.goal.amountMl;
}

/**
 * Replaces the day's goal, returning a new day with its entries untouched:
 * "entries are what happened, the goal is what was intended". Whether the goal
 * is met is therefore recomputed against the new goal — raising it above the
 * total means it is no longer met.
 */
export function withGoal(day: Day, goal: Goal): Day {
  assertGoal(goal);

  return { ...day, goal };
}

/**
 * Milliseconds between the most recent entry and `now`, or `null` for a day
 * with no entries — there is no elapsed time to report, and reporting zero or
 * infinity would read as "just logged" or "never", both of which are wrong.
 *
 * A `now` earlier than the last entry yields 0 rather than a negative
 * duration; clocks move backwards and no caller wants negative elapsed time.
 */
export function timeSinceLastEntry(day: Day, now: Date | string): number | null {
  const entry = lastEntry(day);
  if (entry === null) {
    return null;
  }

  const at = toInstant(now, 'The current moment').getTime();

  return Math.max(0, at - Date.parse(entry.loggedAt));
}
