/**
 * Which days history covers, how each one is judged, and how long the current
 * streak is.
 *
 * Every moment used here is a fixed value passed in and every day is built by
 * hand, per docs/testing-strategy.md: no test reads the real clock and none
 * reaches storage.
 */
import {
  buildHistory,
  createDay,
  createEntry,
  createGoal,
  currentStreak,
  Day,
  HISTORY_DAYS,
  HistoryDay,
  isDayMet,
  isStreakOpenEnded,
  recentDates,
  toHistoryDay,
} from '../../src/domain';

const GOAL = createGoal(2000);
const TODAY = '2026-08-18';

/** A day with a total, against whatever goal applied on it. */
function dayOf(date: string, totalMl: number, goalMl = 2000): Day {
  return createDay(
    date,
    createGoal(goalMl),
    totalMl === 0 ? [] : [createEntry(totalMl, `${date}T09:00:00.000Z`)],
  );
}

/** History from days ordered most recent first, starting today. */
function historyOf(days: readonly (Day | null)[]): HistoryDay[] {
  return buildHistory(recentDates(TODAY, days.length), days);
}

/** A run of days, most recent first, where `true` met its goal. */
function metDays(...met: boolean[]): HistoryDay[] {
  return historyOf(
    recentDates(TODAY, met.length).map((date, index) =>
      met[index] ? dayOf(date, 2000) : dayOf(date, 500),
    ),
  );
}

describe('recentDates', () => {
  it('gives seven days by default, most recent first, ending today', () => {
    expect(recentDates(TODAY)).toEqual([
      '2026-08-18',
      '2026-08-17',
      '2026-08-16',
      '2026-08-15',
      '2026-08-14',
      '2026-08-13',
      '2026-08-12',
    ]);
    expect(recentDates(TODAY)).toHaveLength(HISTORY_DAYS);
  });

  it('counts back over a month and a year boundary', () => {
    expect(recentDates('2026-03-02', 3)).toEqual(['2026-03-02', '2026-03-01', '2026-02-28']);
    expect(recentDates('2027-01-01', 2)).toEqual(['2027-01-01', '2026-12-31']);
  });

  it('counts back over a leap day', () => {
    expect(recentDates('2028-03-01', 2)).toEqual(['2028-03-01', '2028-02-29']);
  });

  it('takes today from a moment as well as from a date', () => {
    const at = new Date(2026, 7, 18, 23, 30);

    expect(recentDates(at, 2)).toEqual(['2026-08-18', '2026-08-17']);
  });

  it('asks for no dates when asked for none, and rejects nonsense counts', () => {
    expect(recentDates(TODAY, 0)).toEqual([]);
    expect(() => recentDates(TODAY, -1)).toThrow(TypeError);
    expect(() => recentDates(TODAY, 1.5)).toThrow(TypeError);
    expect(() => recentDates('the 18th')).toThrow(TypeError);
  });
});

describe('isDayMet', () => {
  it('is true only when the total reached that day’s own goal', () => {
    expect(isDayMet(dayOf(TODAY, 2000))).toBe(true);
    expect(isDayMet(dayOf(TODAY, 2500))).toBe(true);
    expect(isDayMet(dayOf(TODAY, 1999))).toBe(false);
  });

  it('judges a day against the goal it was stored with, not another one', () => {
    // The same 1500 ml: a success on a day whose goal was 1500, and not on a
    // day whose goal was 2000.
    expect(isDayMet(dayOf(TODAY, 1500, 1500))).toBe(true);
    expect(isDayMet(dayOf(TODAY, 1500, 2000))).toBe(false);
  });

  it('is false for a day with no data', () => {
    expect(isDayMet(null)).toBe(false);
  });
});

describe('toHistoryDay', () => {
  it('reports the total and the goal that applied on that day', () => {
    expect(toHistoryDay(TODAY, dayOf(TODAY, 1500, 1800))).toEqual({
      date: TODAY,
      recorded: true,
      totalMl: 1500,
      goalMl: 1800,
      met: false,
    });
  });

  it('reports a day with no data as recorded nothing, met nothing, and no goal', () => {
    expect(toHistoryDay(TODAY, null)).toEqual({
      date: TODAY,
      recorded: false,
      totalMl: 0,
      goalMl: null,
      met: false,
    });
  });

  it('distinguishes a day with no glasses from a day with no data', () => {
    const empty = toHistoryDay(TODAY, createDay(TODAY, GOAL));

    expect(empty.recorded).toBe(true);
    expect(empty.goalMl).toBe(2000);
    expect(toHistoryDay(TODAY, null).recorded).toBe(false);
  });
});

describe('buildHistory', () => {
  it('pairs each date with the day stored under it, in the order asked for', () => {
    const dates = recentDates(TODAY, 3);
    const history = buildHistory(dates, [dayOf(dates[0], 2000), null, dayOf(dates[2], 750)]);

    expect(history.map((day) => day.date)).toEqual(dates);
    expect(history.map((day) => day.totalMl)).toEqual([2000, 0, 750]);
    expect(history.map((day) => day.recorded)).toEqual([true, false, true]);
  });

  it('judges each day against its own goal rather than the newest one', () => {
    const dates = recentDates(TODAY, 2);
    // Yesterday met a 1200 ml goal; today's goal has since been raised.
    const history = buildHistory(dates, [
      dayOf(dates[0], 0, 3000),
      dayOf(dates[1], 1200, 1200),
    ]);

    expect(history.map((day) => day.goalMl)).toEqual([3000, 1200]);
    expect(history.map((day) => day.met)).toEqual([false, true]);
  });

  it('builds nothing from no dates', () => {
    expect(buildHistory([], [])).toEqual([]);
  });

  it('refuses a day list that does not match the dates it was asked for', () => {
    expect(() => buildHistory(recentDates(TODAY, 3), [null, null])).toThrow(TypeError);
  });
});

describe('currentStreak', () => {
  it('counts consecutive met days ending today', () => {
    expect(currentStreak(metDays(true, true, true, false, true))).toBe(3);
  });

  it('counts a streak ending yesterday when today has not been met yet', () => {
    expect(currentStreak(metDays(false, true, true, false))).toBe(2);
  });

  it('counts today only once its goal has actually been met', () => {
    const dates = recentDates(TODAY, 2);
    const yesterday = dayOf(dates[1], 2000);

    // Part-way through today, against a met yesterday: the streak is
    // yesterday's alone until today's goal is reached.
    expect(currentStreak(buildHistory(dates, [dayOf(dates[0], 1999), yesterday]))).toBe(1);
    expect(currentStreak(buildHistory(dates, [dayOf(dates[0], 2000), yesterday]))).toBe(2);
  });

  it('is zero when neither today nor yesterday was met', () => {
    expect(currentStreak(metDays(false, false, true, true))).toBe(0);
  });

  it('is zero for a history with no days at all', () => {
    expect(currentStreak([])).toBe(0);
  });

  it('is zero when nothing has ever been recorded', () => {
    expect(currentStreak(historyOf([null, null, null, null, null, null, null]))).toBe(0);
  });

  it('breaks on a day with no data rather than skipping it', () => {
    const dates = recentDates(TODAY, 4);
    const history = buildHistory(dates, [
      dayOf(dates[0], 2000),
      null,
      dayOf(dates[2], 2000),
      dayOf(dates[3], 2000),
    ]);

    // Skipping the empty day would report four; counting it as not met is what
    // docs/functional-spec.md requires.
    expect(currentStreak(history)).toBe(1);
  });

  it('breaks on a day with no data even when today is not met either', () => {
    const dates = recentDates(TODAY, 3);

    expect(
      currentStreak(buildHistory(dates, [dayOf(dates[0], 0), null, dayOf(dates[2], 2000)])),
    ).toBe(0);
  });

  it('counts a day that met a goal since raised', () => {
    const dates = recentDates(TODAY, 2);
    const history = buildHistory(dates, [
      dayOf(dates[0], 1500, 1500),
      dayOf(dates[1], 1500, 1500),
    ]);

    // Today's goal being 3000 changes nothing above: each day keeps its own.
    expect(currentStreak(history)).toBe(2);
  });
});

describe('isStreakOpenEnded', () => {
  it('is true while every day read from the start of the streak was met', () => {
    expect(isStreakOpenEnded(metDays(true, true, true))).toBe(true);
    expect(isStreakOpenEnded(metDays(false, true, true))).toBe(true);
  });

  it('is false once a day inside the history broke the streak', () => {
    expect(isStreakOpenEnded(metDays(true, true, false))).toBe(false);
    expect(isStreakOpenEnded(metDays(false, false, true))).toBe(false);
  });

  it('is true for an empty history, which contains no break either', () => {
    expect(isStreakOpenEnded([])).toBe(true);
  });

  it('is true when only an unmet today has been read, since yesterday is unknown', () => {
    expect(isStreakOpenEnded(metDays(false))).toBe(true);
  });
});
