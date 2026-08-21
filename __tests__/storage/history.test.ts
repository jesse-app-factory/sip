/**
 * Reading the last seven days and the streak out of storage.
 *
 * Every test runs against the in-memory implementation from TASK-003, per
 * docs/testing-strategy.md: "Storage tests run against the in-memory
 * implementation. No test calls AsyncStorage."
 *
 * Today is a fixed date passed in rather than read from the clock, so which
 * days history covers never depends on when the suite runs.
 */
import {
  createDay,
  createEntry,
  createGoal,
  HISTORY_DAYS,
  recentDates,
  shiftLocalDate,
} from '../../src/domain';
import {
  createInMemoryHydrationStorage,
  createInMemoryKeyValueStore,
  dayKey,
  HydrationStorage,
  InMemoryKeyValueStore,
  MAX_STREAK_DAYS,
  readHistory,
} from '../../src/storage';

const TODAY = '2026-08-18';

/** The date `back` days before today, for writing a day into the past. */
const daysAgo = (back: number): string => shiftLocalDate(TODAY, -back);

function storage(): HydrationStorage {
  return createInMemoryHydrationStorage();
}

/** Writes a day `back` days ago with a total against the goal that applied then. */
async function write(
  target: HydrationStorage,
  back: number,
  totalMl: number,
  goalMl = 2000,
): Promise<void> {
  const date = daysAgo(back);

  await target.writeDay(
    createDay(
      date,
      createGoal(goalMl),
      totalMl === 0 ? [] : [createEntry(totalMl, `${date}T09:00:00.000Z`)],
    ),
  );
}

describe('readHistory', () => {
  it('returns the last seven days, most recent first', async () => {
    const history = await readHistory(storage(), TODAY);

    expect(history.days).toHaveLength(HISTORY_DAYS);
    expect(history.days.map((day) => day.date)).toEqual(recentDates(TODAY));
  });

  it('shows each day’s total against the goal that applied on that day', async () => {
    const target = storage();
    await write(target, 0, 800, 3000);
    await write(target, 1, 1500, 1500);
    await write(target, 2, 2000, 2000);

    const history = await readHistory(target, TODAY);

    expect(history.days.slice(0, 3).map((day) => [day.totalMl, day.goalMl, day.met])).toEqual(
      [
        [800, 3000, false],
        [1500, 1500, true],
        [2000, 2000, true],
      ],
    );
  });

  it('does not judge a past day against a goal raised since', async () => {
    const target = storage();
    await write(target, 1, 1500, 1500);
    // The goal in force from now on is higher; the stored day keeps its own.
    await target.writeGoal(createGoal(3000));

    const [, yesterday] = (await readHistory(target, TODAY)).days;

    expect(yesterday.goalMl).toBe(1500);
    expect(yesterday.met).toBe(true);
  });

  it('takes today from a moment as well as from a date', async () => {
    const at = new Date(2026, 7, 18, 23, 30);

    expect((await readHistory(storage(), at)).days[0].date).toBe(TODAY);
  });

  it('reads seven days and no more when the streak breaks inside them', async () => {
    const store: InMemoryKeyValueStore = createInMemoryKeyValueStore();
    const read = jest.fn(store.read);
    const target = createInMemoryHydrationStorage({ ...store, read });

    await readHistory(target, TODAY);

    expect(read).toHaveBeenCalledTimes(HISTORY_DAYS);
    expect(read).toHaveBeenCalledWith(dayKey(TODAY));
    expect(read).not.toHaveBeenCalledWith(dayKey(daysAgo(HISTORY_DAYS)));
  });

  describe('the current streak', () => {
    it('counts consecutive days meeting the goal, ending today', async () => {
      const target = storage();
      await write(target, 0, 2000);
      await write(target, 1, 2000);
      await write(target, 2, 2000);
      await write(target, 3, 100);

      expect((await readHistory(target, TODAY)).streak).toBe(3);
    });

    it('counts a streak ending yesterday when today is still in progress', async () => {
      const target = storage();
      await write(target, 0, 500);
      await write(target, 1, 2000);
      await write(target, 2, 2000);

      expect((await readHistory(target, TODAY)).streak).toBe(2);
    });

    it('counts today only once its goal has actually been met', async () => {
      const target = storage();
      await write(target, 1, 2000);
      await write(target, 0, 1999);

      expect((await readHistory(target, TODAY)).streak).toBe(1);

      await write(target, 0, 2000);

      expect((await readHistory(target, TODAY)).streak).toBe(2);
    });

    it('is broken by a day with no recorded data rather than skipping it', async () => {
      const target = storage();
      await write(target, 0, 2000);
      // Nothing at all for yesterday.
      await write(target, 2, 2000);
      await write(target, 3, 2000);

      expect((await readHistory(target, TODAY)).streak).toBe(1);
    });

    it('is zero when nothing has ever been recorded, and reads without error', async () => {
      const history = await readHistory(storage(), TODAY);

      expect(history.streak).toBe(0);
      expect(history.days.every((day) => !day.recorded && day.totalMl === 0)).toBe(true);
      expect(history.days.every((day) => day.goalMl === null)).toBe(true);
    });

    it('is zero when neither today nor yesterday met the goal', async () => {
      const target = storage();
      await write(target, 0, 100);
      await write(target, 1, 100);
      await write(target, 2, 2000);

      expect((await readHistory(target, TODAY)).streak).toBe(0);
    });

    it('counts past the seven days on screen', async () => {
      const target = storage();
      for (let back = 0; back < 10; back += 1) {
        await write(target, back, 2000);
      }

      const history = await readHistory(target, TODAY);

      // Ten days met, seven days shown: capping the streak at what is on
      // screen would under-report it.
      expect(history.streak).toBe(10);
      expect(history.days).toHaveLength(HISTORY_DAYS);
    });

    it('stops counting at the limit rather than reading for ever', async () => {
      const target = storage();
      for (let back = 0; back < 12; back += 1) {
        await write(target, back, 2000);
      }

      expect((await readHistory(target, TODAY, { maxStreakDays: 9 })).streak).toBe(9);
    });

    it('reads the seven days on screen whatever the limit says', async () => {
      const history = await readHistory(storage(), TODAY, { maxStreakDays: 1 });

      expect(history.days).toHaveLength(HISTORY_DAYS);
    });

    it('goes back a year and a day by default', () => {
      expect(MAX_STREAK_DAYS).toBe(366);
    });
  });
});
