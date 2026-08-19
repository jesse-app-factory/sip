/**
 * What the app persists and reads back: the goal, today's entries, and one
 * record per past day.
 *
 * Every test here runs against the in-memory store, per
 * docs/testing-strategy.md, "Storage tests" — no test in this suite calls
 * AsyncStorage, which `noAsyncStorage.test.ts` asserts of the whole directory.
 *
 * Closing and reopening the app is modelled as a second `HydrationStorage`
 * built over the store the first one wrote to: the process is gone, the stored
 * strings are not.
 */
import {
  addEntry,
  createDay,
  createEntry,
  createGoal,
  Day,
  DEFAULT_GOAL_ML,
  totalMl,
  undoLastEntry,
} from '../../src/domain';
import {
  createInMemoryHydrationStorage,
  createInMemoryKeyValueStore,
  dayKey,
  GOAL_KEY,
  InMemoryKeyValueStore,
} from '../../src/storage';

const TODAY = '2026-08-18';
const YESTERDAY = '2026-08-17';
const TWO_DAYS_AGO = '2026-08-16';

const GOAL = createGoal(2000);

const at = (date: string, time: string): string => `${date}T${time}:00.000Z`;

function reopen(store: InMemoryKeyValueStore) {
  return createInMemoryHydrationStorage(store);
}

describe('the goal', () => {
  it('is read back as it was written', async () => {
    const storage = createInMemoryHydrationStorage();

    await storage.writeGoal(createGoal(2500));

    expect(await storage.readGoal()).toEqual({ amountMl: 2500 });
  });

  it('survives closing and reopening the app', async () => {
    const store = createInMemoryKeyValueStore();

    await createInMemoryHydrationStorage(store).writeGoal(createGoal(1750));

    expect(await reopen(store).readGoal()).toEqual({ amountMl: 1750 });
  });

  it('is the default until one has been written', async () => {
    expect(await createInMemoryHydrationStorage().readGoal()).toEqual({
      amountMl: DEFAULT_GOAL_ML,
    });
  });

  it('is stored under its own key, apart from every day', async () => {
    const store = createInMemoryKeyValueStore();
    const storage = createInMemoryHydrationStorage(store);

    await storage.writeGoal(createGoal(2500));
    await storage.writeDay(createDay(TODAY, GOAL));

    expect(Object.keys(store.snapshot()).sort()).toEqual([dayKey(TODAY), GOAL_KEY].sort());
  });

  it('is rejected rather than stored when it is not a valid goal', async () => {
    const store = createInMemoryKeyValueStore();
    const storage = createInMemoryHydrationStorage(store);

    await expect(storage.writeGoal({ amountMl: 0 })).rejects.toThrow(TypeError);
    await expect(storage.writeGoal({ amountMl: 1.5 })).rejects.toThrow(TypeError);

    expect(store.snapshot()).toEqual({});
  });
});

describe("the current day's entries", () => {
  it('survive closing and reopening the app', async () => {
    const store = createInMemoryKeyValueStore();
    const logged = addEntry(
      addEntry(createDay(TODAY, GOAL), createEntry(250, at(TODAY, '09:00'))),
      createEntry(330, at(TODAY, '11:30')),
    );

    await createInMemoryHydrationStorage(store).writeDay(logged);

    const reopened = await reopen(store).readDay(TODAY);

    expect(reopened).toEqual(logged);
    expect(totalMl(reopened as Day)).toBe(580);
  });

  it('keep the goal that applied on the day they were logged', async () => {
    const store = createInMemoryKeyValueStore();
    const storage = createInMemoryHydrationStorage(store);

    await storage.writeDay(createDay(TODAY, createGoal(1500)));
    await storage.writeGoal(createGoal(3000));

    expect((await reopen(store).readDay(TODAY))?.goal).toEqual({ amountMl: 1500 });
  });

  it('are read back in order, oldest first', async () => {
    const store = createInMemoryKeyValueStore();
    const day = createDay(TODAY, GOAL, [
      createEntry(200, at(TODAY, '18:00')),
      createEntry(250, at(TODAY, '07:15')),
    ]);

    await createInMemoryHydrationStorage(store).writeDay(day);

    expect((await reopen(store).readDay(TODAY))?.entries.map((entry) => entry.amountMl)).toEqual([
      250, 200,
    ]);
  });

  it('lose the undone glass once the day is written again', async () => {
    const store = createInMemoryKeyValueStore();
    const storage = createInMemoryHydrationStorage(store);
    const logged = addEntry(createDay(TODAY, GOAL), createEntry(250, at(TODAY, '09:00')));

    await storage.writeDay(logged);
    await storage.writeDay(undoLastEntry(logged));

    expect((await reopen(store).readDay(TODAY))?.entries).toEqual([]);
  });

  it('are absent, rather than empty, for a day never written', async () => {
    expect(await createInMemoryHydrationStorage().readDay(TODAY)).toBeNull();
  });
});

describe('past days', () => {
  it('are each retained under their own date key', async () => {
    const store = createInMemoryKeyValueStore();
    const storage = createInMemoryHydrationStorage(store);

    await storage.writeDay(createDay(TWO_DAYS_AGO, GOAL, [createEntry(500, at(TWO_DAYS_AGO, '08:00'))]));
    await storage.writeDay(createDay(YESTERDAY, GOAL, [createEntry(750, at(YESTERDAY, '08:00'))]));
    await storage.writeDay(createDay(TODAY, GOAL, [createEntry(250, at(TODAY, '08:00'))]));

    expect(Object.keys(store.snapshot()).sort()).toEqual([
      dayKey(TWO_DAYS_AGO),
      dayKey(YESTERDAY),
      dayKey(TODAY),
    ]);
  });

  it('are not overwritten when a new day starts', async () => {
    const store = createInMemoryKeyValueStore();
    const storage = createInMemoryHydrationStorage(store);
    const yesterday = createDay(YESTERDAY, createGoal(1500), [
      createEntry(400, at(YESTERDAY, '08:00')),
      createEntry(600, at(YESTERDAY, '20:00')),
    ]);

    await storage.writeDay(yesterday);
    // Local midnight passes: today starts at zero and is written on its own key.
    await storage.writeDay(createDay(TODAY, createGoal(2500)));

    const reopened = reopen(store);

    expect(await reopened.readDay(YESTERDAY)).toEqual(yesterday);
    expect(totalMl((await reopened.readDay(YESTERDAY)) as Day)).toBe(1000);
    expect(totalMl((await reopened.readDay(TODAY)) as Day)).toBe(0);
  });

  it('are not disturbed by logging repeatedly against today', async () => {
    const store = createInMemoryKeyValueStore();
    const storage = createInMemoryHydrationStorage(store);
    const yesterday = createDay(YESTERDAY, GOAL, [createEntry(900, at(YESTERDAY, '12:00'))]);

    await storage.writeDay(yesterday);

    let today = createDay(TODAY, GOAL);
    for (const hour of ['08', '10', '12', '14']) {
      today = addEntry(today, createEntry(250, at(TODAY, `${hour}:00`)));
      await storage.writeDay(today);
    }

    expect(await storage.readDay(YESTERDAY)).toEqual(yesterday);
    expect(totalMl((await storage.readDay(TODAY)) as Day)).toBe(1000);
  });

  it('are read as a run of dates, in the order asked for, with gaps as null', async () => {
    const storage = createInMemoryHydrationStorage();

    await storage.writeDay(createDay(TWO_DAYS_AGO, GOAL, [createEntry(500, at(TWO_DAYS_AGO, '08:00'))]));
    await storage.writeDay(createDay(TODAY, GOAL, [createEntry(250, at(TODAY, '08:00'))]));

    const days = await storage.readDays([TWO_DAYS_AGO, YESTERDAY, TODAY]);

    expect(days.map((day) => day && day.date)).toEqual([TWO_DAYS_AGO, null, TODAY]);
    expect(days.map((day) => day && totalMl(day))).toEqual([500, null, 250]);
  });

  it('are read as an empty list when no dates are asked for', async () => {
    expect(await createInMemoryHydrationStorage().readDays([])).toEqual([]);
  });
});

describe('a day that is not a day', () => {
  it('is rejected rather than stored', async () => {
    const store = createInMemoryKeyValueStore();
    const storage = createInMemoryHydrationStorage(store);
    const invalid = [
      { date: TODAY, goal: { amountMl: 0 }, entries: [] },
      { date: TODAY, goal: GOAL, entries: [{ amountMl: -1, loggedAt: at(TODAY, '09:00') }] },
      { date: TODAY, goal: GOAL, entries: [{ amountMl: 250, loggedAt: 'whenever' }] },
    ] as unknown as Day[];

    for (const day of invalid) {
      await expect(storage.writeDay(day)).rejects.toThrow(TypeError);
    }

    expect(store.snapshot()).toEqual({});
  });

  it('cannot be filed under a date that is not a local date', async () => {
    const storage = createInMemoryHydrationStorage();

    await expect(storage.writeDay({ ...createDay(TODAY, GOAL), date: '18-08-2026' })).rejects.toThrow(
      TypeError,
    );
    await expect(storage.readDay('tomorrow')).rejects.toThrow(TypeError);
    await expect(storage.readDay('2026-02-30')).rejects.toThrow(TypeError);
  });
});
