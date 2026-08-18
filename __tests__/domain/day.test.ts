/**
 * The arithmetic over a day: totals, progress, whether the goal is met, undo,
 * and time since the last entry.
 *
 * Every moment used here is a fixed value passed in. No test reads the real
 * clock, per docs/testing-strategy.md.
 */
import {
  addEntry,
  createDay,
  createEntry,
  createGoal,
  Day,
  Entry,
  isGoalMet,
  lastEntry,
  progress,
  remainingMl,
  timeSinceLastEntry,
  totalMl,
  undoLastEntry,
  withGoal,
} from '../../src/domain';

const GOAL = createGoal(2000);
const DATE = '2026-08-18';

const at = (time: string): string => `${DATE}T${time}:00.000Z`;

/** Freezing proves the immutability claim rather than trusting it. */
function frozenDay(...entries: Entry[]): Day {
  const day = createDay(DATE, GOAL, entries);

  Object.freeze(day);
  Object.freeze(day.entries);
  day.entries.forEach(Object.freeze);

  return day;
}

describe('createDay', () => {
  it('starts empty, with the goal that applies to it', () => {
    const day = createDay(DATE, GOAL);

    expect(day.date).toBe(DATE);
    expect(day.goal).toEqual({ amountMl: 2000 });
    expect(day.entries).toEqual([]);
  });

  it('copies the entries it is given, so the caller cannot change the day', () => {
    const entries = [createEntry(250, at('09:00'))];
    const day = createDay(DATE, GOAL, entries);

    entries.push(createEntry(250, at('10:00')));

    expect(day.entries).toHaveLength(1);
  });

  it('orders the entries it is given oldest first', () => {
    const day = createDay(DATE, GOAL, [
      createEntry(300, at('15:00')),
      createEntry(100, at('08:00')),
      createEntry(200, at('11:00')),
    ]);

    expect(day.entries.map((entry) => entry.amountMl)).toEqual([100, 200, 300]);
  });

  it('rejects an invalid goal, date or entry', () => {
    expect(() => createDay(DATE, { amountMl: 0 })).toThrow(TypeError);
    expect(() => createDay('not-a-date', GOAL)).toThrow(TypeError);
    expect(() => createDay(DATE, GOAL, [{ amountMl: 250 } as Entry])).toThrow(TypeError);
  });
});

describe('addEntry', () => {
  it('returns a new day containing the entry', () => {
    const day = frozenDay();
    const entry = createEntry(250, at('09:00'));

    const next = addEntry(day, entry);

    expect(next).not.toBe(day);
    expect(next.entries).toEqual([entry]);
  });

  it('never mutates the day it was given', () => {
    const first = createEntry(250, at('09:00'));
    const day = frozenDay(first);

    const next = addEntry(day, createEntry(500, at('12:00')));

    expect(day.entries).toEqual([first]);
    expect(day.entries).toHaveLength(1);
    expect(totalMl(day)).toBe(250);
    expect(next.entries).toHaveLength(2);
    expect(next.entries).not.toBe(day.entries);
  });

  it('keeps the day, its date and its goal otherwise unchanged', () => {
    const day = frozenDay();

    const next = addEntry(day, createEntry(250, at('09:00')));

    expect(next.date).toBe(day.date);
    expect(next.goal).toEqual(day.goal);
  });

  it('places an out-of-order entry by its timestamp, not by when it arrived', () => {
    const day = createDay(DATE, GOAL, [createEntry(300, at('15:00'))]);

    const next = addEntry(day, createEntry(100, at('08:00')));

    expect(next.entries.map((entry) => entry.amountMl)).toEqual([100, 300]);
  });

  it('rejects something that is not an entry', () => {
    expect(() => addEntry(createDay(DATE, GOAL), 250 as unknown as Entry)).toThrow(
      TypeError,
    );
  });
});

describe('totalMl and remainingMl', () => {
  it('total is zero for a day with no entries', () => {
    expect(totalMl(createDay(DATE, GOAL))).toBe(0);
  });

  it('total is the sum of the entries', () => {
    const day = createDay(DATE, GOAL, [
      createEntry(250, at('09:00')),
      createEntry(500, at('12:00')),
    ]);

    expect(totalMl(day)).toBe(750);
  });

  it('remaining counts down to zero and never below it', () => {
    const day = createDay(DATE, GOAL, [createEntry(500, at('09:00'))]);

    expect(remainingMl(day)).toBe(1500);
    expect(remainingMl(addEntry(day, createEntry(2000, at('12:00'))))).toBe(0);
  });
});

describe('progress', () => {
  it('is 0 for a day with no entries', () => {
    expect(progress(createDay(DATE, GOAL))).toBe(0);
  });

  it('is the fraction of the goal logged so far', () => {
    const day = createDay(DATE, GOAL, [createEntry(500, at('09:00'))]);

    expect(progress(day)).toBeCloseTo(0.25, 10);
    expect(progress(addEntry(day, createEntry(500, at('12:00'))))).toBeCloseTo(0.5, 10);
  });

  it('is exactly 1 when the goal is reached', () => {
    const day = createDay(DATE, GOAL, [createEntry(2000, at('09:00'))]);

    expect(progress(day)).toBe(1);
  });

  it('is clamped at 1 when the goal is exceeded', () => {
    const day = createDay(DATE, GOAL, [createEntry(5000, at('09:00'))]);

    expect(progress(day)).toBe(1);
  });

  it('stays within 0 and 1 across a day of logging', () => {
    let day = createDay(DATE, GOAL);

    for (const hour of ['08', '10', '12', '14', '16', '18', '20']) {
      day = addEntry(day, createEntry(400, at(`${hour}:00`)));

      expect(progress(day)).toBeGreaterThanOrEqual(0);
      expect(progress(day)).toBeLessThanOrEqual(1);
    }
  });
});

describe('isGoalMet', () => {
  it('is false for a day with no entries', () => {
    expect(isGoalMet(createDay(DATE, GOAL))).toBe(false);
  });

  it('is false while the total is below the goal', () => {
    const day = createDay(DATE, GOAL, [createEntry(1999, at('09:00'))]);

    expect(isGoalMet(day)).toBe(false);
  });

  it('is true when the total equals the goal', () => {
    const day = createDay(DATE, GOAL, [createEntry(2000, at('09:00'))]);

    expect(isGoalMet(day)).toBe(true);
  });

  it('is true when the total exceeds the goal', () => {
    const day = createDay(DATE, GOAL, [createEntry(2500, at('09:00'))]);

    expect(isGoalMet(day)).toBe(true);
  });

  it('stays true when the goal is raised no higher than the total', () => {
    const met = createDay(DATE, GOAL, [createEntry(2500, at('09:00'))]);

    const raised = withGoal(met, createGoal(2500));

    expect(isGoalMet(raised)).toBe(true);
  });

  it('becomes false when the goal is raised above the total', () => {
    const met = createDay(DATE, GOAL, [createEntry(2500, at('09:00'))]);

    const raised = withGoal(met, createGoal(3000));

    expect(isGoalMet(raised)).toBe(false);
    expect(progress(raised)).toBeCloseTo(2500 / 3000, 10);
  });
});

describe('withGoal', () => {
  it('returns a new day and leaves the entries untouched', () => {
    const entry = createEntry(2500, at('09:00'));
    const day = frozenDay(entry);

    const next = withGoal(day, createGoal(3000));

    expect(next).not.toBe(day);
    expect(next.goal).toEqual({ amountMl: 3000 });
    expect(next.entries).toEqual([entry]);
    expect(day.goal).toEqual({ amountMl: 2000 });
    expect(totalMl(next)).toBe(totalMl(day));
  });

  it('rejects an invalid goal', () => {
    expect(() => withGoal(createDay(DATE, GOAL), { amountMl: -1 })).toThrow(TypeError);
  });
});

describe('undoLastEntry', () => {
  it('removes the single most recent entry', () => {
    const first = createEntry(250, at('09:00'));
    const second = createEntry(500, at('12:00'));
    const day = frozenDay(first, second);

    const next = undoLastEntry(day);

    expect(next.entries).toEqual([first]);
    expect(totalMl(next)).toBe(250);
  });

  it('removes the most recent by timestamp, not by insertion order', () => {
    const early = createEntry(100, at('08:00'));
    const late = createEntry(300, at('20:00'));
    const day = addEntry(createDay(DATE, GOAL, [late]), early);

    expect(undoLastEntry(day).entries).toEqual([early]);
  });

  it('never mutates the day it was given', () => {
    const day = frozenDay(createEntry(250, at('09:00')));

    undoLastEntry(day);

    expect(day.entries).toHaveLength(1);
  });

  it('is a no-op that throws nothing on a day with no entries', () => {
    const day = frozenDay();

    expect(() => undoLastEntry(day)).not.toThrow();
    expect(undoLastEntry(day).entries).toEqual([]);
    expect(totalMl(undoLastEntry(day))).toBe(0);
    expect(progress(undoLastEntry(day))).toBe(0);
  });

  it('undoing every entry leaves the day empty rather than negative', () => {
    let day = createDay(DATE, GOAL, [
      createEntry(250, at('09:00')),
      createEntry(500, at('12:00')),
    ]);

    day = undoLastEntry(undoLastEntry(undoLastEntry(day)));

    expect(day.entries).toEqual([]);
    expect(totalMl(day)).toBe(0);
  });
});

describe('lastEntry', () => {
  it('is null for a day with no entries', () => {
    expect(lastEntry(createDay(DATE, GOAL))).toBeNull();
  });

  it('is the most recent entry', () => {
    const day = createDay(DATE, GOAL, [
      createEntry(250, at('09:00')),
      createEntry(500, at('12:00')),
    ]);

    expect(lastEntry(day)?.amountMl).toBe(500);
  });
});

describe('timeSinceLastEntry', () => {
  it('is null for a day with no entries, not zero and not infinity', () => {
    const elapsed = timeSinceLastEntry(createDay(DATE, GOAL), at('12:00'));

    expect(elapsed).toBeNull();
    expect(elapsed).not.toBe(0);
    expect(elapsed).not.toBe(Number.POSITIVE_INFINITY);
  });

  it('is the milliseconds since the most recent entry', () => {
    const day = createDay(DATE, GOAL, [
      createEntry(250, at('09:00')),
      createEntry(500, at('11:00')),
    ]);

    expect(timeSinceLastEntry(day, at('12:00'))).toBe(60 * 60 * 1000);
  });

  it('is zero at the moment the entry was logged', () => {
    const day = createDay(DATE, GOAL, [createEntry(250, at('09:00'))]);

    expect(timeSinceLastEntry(day, at('09:00'))).toBe(0);
  });

  it('never reports a negative duration for a clock that moved backwards', () => {
    const day = createDay(DATE, GOAL, [createEntry(250, at('09:00'))]);

    expect(timeSinceLastEntry(day, at('08:00'))).toBe(0);
  });

  it('rejects a moment that is not a moment', () => {
    const day = createDay(DATE, GOAL, [createEntry(250, at('09:00'))]);

    expect(() => timeSinceLastEntry(day, 'soon')).toThrow(TypeError);
  });
});
