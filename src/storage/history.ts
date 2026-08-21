/**
 * Reading recent history out of storage: the last seven days, and the streak
 * they end.
 *
 * The judgement is all in `domain/history.ts`. What is here is the reading —
 * which day keys to ask for, and how many — because that is a question about
 * storage rather than about hydration, and because a streak longer than the
 * seven days on screen cannot be answered without asking for more days.
 *
 * ## Why the window grows
 *
 * docs/functional-spec.md puts no limit on a streak: it is "the number of
 * consecutive days on which the goal was met". Seven days of history would cap
 * it at seven and quietly under-report an eighth day, so the days are read a
 * window at a time and another window is read only while the streak is still
 * running — `isStreakOpenEnded` is what says so.
 *
 * In practice a streak breaks quickly and one window is all that is read. The
 * cost is bounded either way: nothing goes further back than
 * `MAX_STREAK_DAYS`, so a user with an unbroken year does not spend an
 * unbounded number of reads opening the screen.
 *
 * Each day is its own key, per docs/architecture.md, "Storage layout", so this
 * only ever reads — it writes nothing and repairs nothing.
 */
import {
  buildHistory,
  currentStreak,
  HISTORY_DAYS,
  HistoryDay,
  isStreakOpenEnded,
  LocalDate,
  recentDates,
  shiftLocalDate,
  toLocalDate,
} from '../domain';
import { HydrationStorage } from './hydrationStorage';

/**
 * The furthest back a streak is counted. A year and a day, so that a streak of
 * exactly a year is reported as one rather than clipped.
 */
export const MAX_STREAK_DAYS = 366;

export interface History {
  /**
   * The last `HISTORY_DAYS` days, most recent first, each with the goal that
   * applied on it. Always that many entries: a date with nothing stored is a
   * day with no data rather than an absence from the list.
   */
  readonly days: readonly HistoryDay[];
  /** Consecutive days meeting their own goal, ending today or yesterday. */
  readonly streak: number;
}

export interface ReadHistoryOptions {
  /**
   * How far back the streak may be counted, defaulting to `MAX_STREAK_DAYS`.
   * Never fewer than the days shown — the window on screen is read whatever
   * this says.
   */
  readonly maxStreakDays?: number;
}

/**
 * The last seven days ending on `now`, and the streak they end.
 *
 * Never rejects: storage returns `null` for a date holding nothing readable,
 * and a user with no data at all gets seven empty days and a streak of zero
 * rather than an error.
 */
export async function readHistory(
  storage: HydrationStorage,
  now: Date | LocalDate,
  options: ReadHistoryOptions = {},
): Promise<History> {
  const today = toLocalDate(now, 'Today');
  const limit = Math.max(HISTORY_DAYS, options.maxStreakDays ?? MAX_STREAK_DAYS);

  let days: HistoryDay[] = [];

  while (days.length < limit) {
    const size = Math.min(HISTORY_DAYS, limit - days.length);
    // The next window starts where the last one ended, counting back from
    // today rather than from the earliest date read, so no date is read twice
    // and none is skipped.
    const dates = recentDates(shiftLocalDate(today, -days.length, 'Today'), size);

    days = [...days, ...buildHistory(dates, await storage.readDays(dates))];

    if (!isStreakOpenEnded(days)) {
      // The streak has been broken inside what has been read, so reading
      // further back cannot change it.
      break;
    }
  }

  return { days: days.slice(0, HISTORY_DAYS), streak: currentStreak(days) };
}
