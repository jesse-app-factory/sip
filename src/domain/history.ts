/**
 * Recent history and the current streak: which days to look at, how each one
 * is judged, and how many of them in a row were met.
 *
 * Everything here is a pure function over days that have already been read.
 * Nothing reads storage and nothing reads the clock — the moment history is
 * counted from arrives as an argument, per docs/technical-spec.md, "Time", so
 * a streak "ending today or yesterday" is testable without waiting for
 * midnight.
 *
 * ## A day is judged against its own goal
 *
 * docs/functional-spec.md: "Each day retains the goal that applied on that
 * day. Raising today's goal does not retroactively turn a past success into a
 * failure." A `Day` carries the goal it was stored with, so every judgement
 * here uses `isGoalMet` on that day and no function takes today's goal as an
 * argument at all — there is nowhere for the wrong goal to get in.
 *
 * ## A missing day is not a skipped day
 *
 * `null` means nothing was recorded for that date. It counts as not met and
 * breaks the streak rather than being passed over, per docs/functional-spec.md,
 * "History", which is why history is built from the list of dates asked for
 * rather than from whatever storage happened to return.
 */
import { Day, isGoalMet, totalMl } from './day';
import { LocalDate, shiftLocalDate, toLocalDate } from './time';

/** How many days of history are shown, per docs/functional-spec.md. */
export const HISTORY_DAYS = 7;

/** One day as history reads it: what was drunk, what was asked, and whether it counted. */
export interface HistoryDay {
  readonly date: LocalDate;
  /** False when nothing is stored for the date — a day the user has no data for. */
  readonly recorded: boolean;
  /** The day's total, zero for a day with no data and for one with no glasses. */
  readonly totalMl: number;
  /** The goal that applied on that day, `null` when nothing was recorded. */
  readonly goalMl: number | null;
  /** Whether the total reached that day's own goal. Never true without data. */
  readonly met: boolean;
}

/**
 * The `count` local dates ending on `today`, most recent first — the order
 * history is shown in, and the order storage is asked for them in.
 */
export function recentDates(
  today: Date | LocalDate,
  count: number = HISTORY_DAYS,
): LocalDate[] {
  const date = toLocalDate(today, 'Today');

  if (!Number.isInteger(count) || count < 0) {
    throw new TypeError(
      `A number of days of history must be a whole number of zero or more, received ${String(
        count,
      )}`,
    );
  }

  return Array.from({ length: count }, (_, index) => shiftLocalDate(date, -index, 'Today'));
}

/**
 * Whether a day met its goal. A date with no data did not: there is no total
 * and no goal, and treating it as a success would invent both.
 */
export function isDayMet(day: Day | null): boolean {
  return day !== null && isGoalMet(day);
}

/**
 * One day of history, from the date asked for and whatever storage held under
 * it. The date comes from the request rather than from the day, so a date with
 * nothing stored still appears in history.
 */
export function toHistoryDay(date: LocalDate, day: Day | null): HistoryDay {
  return {
    date: toLocalDate(date, 'A history date'),
    recorded: day !== null,
    totalMl: day === null ? 0 : totalMl(day),
    goalMl: day === null ? null : day.goal.amountMl,
    met: isDayMet(day),
  };
}

/**
 * History over the dates asked for, in the order they were asked for, pairing
 * each with the day stored under it.
 *
 * The two arrays must be the same length, because they are the same request:
 * `days[n]` is what storage held for `dates[n]`, including `null` for nothing.
 * A mismatch would silently shift every day onto the wrong date.
 */
export function buildHistory(
  dates: readonly LocalDate[],
  days: readonly (Day | null)[],
): HistoryDay[] {
  if (dates.length !== days.length) {
    throw new TypeError(
      `History needs one day per date, received ${dates.length} dates and ${days.length} days`,
    );
  }

  return dates.map((date, index) => toHistoryDay(date, days[index]));
}

/**
 * Where the streak starts counting in a history ordered most recent first:
 * today when today has been met, and yesterday otherwise.
 *
 * This is what "ending today or yesterday" means, per docs/functional-spec.md.
 * A day still in progress has not failed — nothing says the goal will not be
 * met before midnight — so an unmet today is stepped over rather than counted
 * or treated as a break. It counts "only once its goal has actually been met".
 */
function streakStart(history: readonly HistoryDay[]): number {
  return history.length > 0 && history[0].met ? 0 : 1;
}

/**
 * The current streak: consecutive days meeting their own goal, ending today or
 * yesterday. Zero when yesterday was missed, and zero for an empty history.
 */
export function currentStreak(history: readonly HistoryDay[]): number {
  let index = streakStart(history);
  let length = 0;

  while (index < history.length && history[index].met) {
    length += 1;
    index += 1;
  }

  return length;
}

/**
 * Whether the streak runs off the end of this history rather than being broken
 * inside it — so a longer history might report a longer streak.
 *
 * A caller reading a fixed window needs this to know the difference between
 * "the streak is three days" and "three days and counting, keep reading". An
 * empty history is open-ended for the same reason: nothing in it is a break.
 */
export function isStreakOpenEnded(history: readonly HistoryDay[]): boolean {
  return streakStart(history) + currentStreak(history) >= history.length;
}
