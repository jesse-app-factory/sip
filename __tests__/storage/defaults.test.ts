/**
 * What reading gives back when what is stored is absent, empty or not valid
 * JSON.
 *
 * A device store accumulates truncated writes, values from older versions and
 * whatever an interrupted install left behind. docs/functional-spec.md,
 * "Data", makes the requirement plain: stored data that is missing or
 * unreadable falls back to documented defaults rather than crashing. The
 * defaults are documented in `src/storage/records.ts`, and this suite is what
 * holds the code to them.
 *
 * Raw strings go in through the in-memory store's `seed`, which bypasses the
 * encoder — the only way to reproduce a value the encoder would never have
 * produced.
 */
import { DEFAULT_GOAL_ML } from '../../src/domain';
import {
  createInMemoryHydrationStorage,
  createInMemoryKeyValueStore,
  dayKey,
  GOAL_KEY,
} from '../../src/storage';

const DATE = '2026-08-18';
const DEFAULT = { amountMl: DEFAULT_GOAL_ML };

function storedGoal(raw: string) {
  const store = createInMemoryKeyValueStore();
  store.seed(GOAL_KEY, raw);

  return createInMemoryHydrationStorage(store).readGoal();
}

function storedDay(raw: string) {
  const store = createInMemoryKeyValueStore();
  store.seed(dayKey(DATE), raw);

  return createInMemoryHydrationStorage(store).readDay(DATE);
}

describe('an unreadable goal', () => {
  it('is the default when nothing has ever been written', async () => {
    await expect(createInMemoryHydrationStorage().readGoal()).resolves.toEqual(DEFAULT);
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['truncated JSON', '{"amountMl":'],
    ['not JSON at all', 'two litres please'],
    ['JSON null', 'null'],
    ['a number', '2500'],
    ['a string', '"2500"'],
    ['an array', '[2500]'],
    ['an object with no amount', '{}'],
    ['an amount that is a string', '{"amountMl":"2500"}'],
    ['an amount of zero', '{"amountMl":0}'],
    ['a negative amount', '{"amountMl":-500}'],
    ['a fractional amount', '{"amountMl":2500.5}'],
    ['an amount that is null', '{"amountMl":null}'],
  ])('is the default when it is %s', async (_case, raw) => {
    await expect(storedGoal(raw)).resolves.toEqual(DEFAULT);
  });

  it('does not throw for any of them', async () => {
    for (const raw of ['', '{', 'null', '{"amountMl":0}']) {
      await expect(storedGoal(raw)).resolves.toBeDefined();
    }
  });

  it('keeps a valid amount, and nothing else stored alongside it', async () => {
    await expect(storedGoal('{"amountMl":1500,"units":"pints"}')).resolves.toEqual({
      amountMl: 1500,
    });
  });
});

describe('an unreadable day', () => {
  it('is null when nothing has ever been written for that date', async () => {
    await expect(createInMemoryHydrationStorage().readDay(DATE)).resolves.toBeNull();
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['truncated JSON', '{"goal":{"amountMl":2000},"entries":['],
    ['not JSON at all', 'yesterday, probably'],
    ['JSON null', 'null'],
    ['a number', '2000'],
    ['a string', '"a day"'],
    ['an array', '[]'],
    ['an object with no goal', '{"entries":[]}'],
    ['a goal that is not a goal', '{"goal":"2000","entries":[]}'],
    ['a goal of zero', '{"goal":{"amountMl":0},"entries":[]}'],
  ])('is null when it is %s', async (_case, raw) => {
    await expect(storedDay(raw)).resolves.toBeNull();
  });

  it('has no entries when its entries are missing or not an array', async () => {
    for (const raw of [
      '{"goal":{"amountMl":2000}}',
      '{"goal":{"amountMl":2000},"entries":null}',
      '{"goal":{"amountMl":2000},"entries":"250ml"}',
      '{"goal":{"amountMl":2000},"entries":{"0":{"amountMl":250}}}',
    ]) {
      await expect(storedDay(raw)).resolves.toEqual({
        date: DATE,
        goal: { amountMl: 2000 },
        entries: [],
      });
    }
  });

  it('keeps the entries that are readable and drops the ones that are not', async () => {
    const day = await storedDay(
      JSON.stringify({
        goal: { amountMl: 2000 },
        entries: [
          { amountMl: 250, loggedAt: `${DATE}T09:00:00.000Z` },
          { amountMl: 0, loggedAt: `${DATE}T10:00:00.000Z` },
          { amountMl: 330, loggedAt: 'later on' },
          'a glass',
          null,
          { amountMl: 200, loggedAt: `${DATE}T11:00:00.000Z` },
        ],
      }),
    );

    expect(day?.entries).toEqual([
      { amountMl: 250, loggedAt: `${DATE}T09:00:00.000Z` },
      { amountMl: 200, loggedAt: `${DATE}T11:00:00.000Z` },
    ]);
  });

  it('belongs to the date it is stored under, whatever the record claims', async () => {
    const day = await storedDay('{"date":"1999-12-31","goal":{"amountMl":2000},"entries":[]}');

    expect(day?.date).toBe(DATE);
  });

  it('carries no fields the app did not write', async () => {
    const day = await storedDay(
      '{"goal":{"amountMl":2000,"units":"pints"},"entries":[],"mood":"thirsty"}',
    );

    expect(day).toEqual({ date: DATE, goal: { amountMl: 2000 }, entries: [] });
  });
});

describe('an unreadable day among readable ones', () => {
  it('does not stop the others being read', async () => {
    const store = createInMemoryKeyValueStore();
    store.seed(dayKey('2026-08-16'), '{"goal":{"amountMl":2000},"entries":[]}');
    store.seed(dayKey('2026-08-17'), 'corrupted beyond repair');
    store.seed(dayKey('2026-08-18'), '{"goal":{"amountMl":2000},"entries":[]}');

    const days = await createInMemoryHydrationStorage(store).readDays([
      '2026-08-16',
      '2026-08-17',
      '2026-08-18',
    ]);

    expect(days.map((day) => day && day.date)).toEqual(['2026-08-16', null, '2026-08-18']);
  });
});
