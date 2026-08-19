/**
 * Logging a glass, undoing it, and where the day stands afterwards.
 *
 * Every test renders the screen over the in-memory storage from TASK-003, per
 * docs/testing-strategy.md, "Screen tests": render with fake storage and
 * assert on what the user would see and what was persisted. No test here calls
 * AsyncStorage — `storageInterface.test.ts` asserts that of these sources too.
 *
 * The clock is injected, per docs/testing-strategy.md, "Time", so the day
 * boundary is tested by moving the clock rather than by waiting for midnight.
 *
 * Closing and reopening the app is modelled the way the storage and goal
 * suites model it: a second `HydrationStorage` built over the store the first
 * one wrote to. The process is gone, the stored strings are not.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import {
  createDay,
  createEntry,
  createGoal,
  toLocalDate,
  totalMl,
} from '../../src/domain';
import {
  DATE_CHECK_INTERVAL_MS,
  GLASS_SIZES_ML,
  glassButtonLabel,
  GOAL_LABEL,
  GOAL_MET_MESSAGE,
  REMAINING_LABEL,
  statLabel,
  TodayScreen,
  TOTAL_LABEL,
  UNDO_LABEL,
  WRITE_FAILED_MESSAGE,
} from '../../src/screens';
import {
  createHydrationStorage,
  createInMemoryHydrationStorage,
  createInMemoryKeyValueStore,
  HydrationStorage,
  InMemoryKeyValueStore,
  KeyValueStore,
} from '../../src/storage';

/** A fixed moment, so which day is "today" never depends on when this runs. */
const NOW = new Date('2026-08-18T10:00:00.000Z');

const hoursAfter = (hours: number): Date =>
  new Date(NOW.getTime() + hours * 60 * 60 * 1000);

// Derived from the injected clock rather than written out, so the dates match
// whatever time zone the machine running this happens to be in.
const TODAY = toLocalDate(NOW);
const TOMORROW = toLocalDate(hoursAfter(24));

/** Stable across renders, so the screen's date check is not resubscribed. */
const now = () => NOW;
const tomorrow = () => hoursAfter(24);

function reopen(store: InMemoryKeyValueStore): HydrationStorage {
  return createInMemoryHydrationStorage(store);
}

/** Renders the screen and waits for today to arrive from storage. */
async function open(storage: HydrationStorage, clock: () => Date = now) {
  render(<TodayScreen storage={storage} now={clock} />);

  await screen.findByLabelText(new RegExp(`^${TOTAL_LABEL}: `));
}

function tapGlass(amountMl: number): void {
  fireEvent.press(screen.getByRole('button', { name: glassButtonLabel(amountMl) }));
}

function tapUndo(): void {
  fireEvent.press(screen.getByRole('button', { name: UNDO_LABEL }));
}

function expectStat(label: string, amountMl: number): void {
  expect(screen.getByLabelText(statLabel(label, amountMl))).toBeOnTheScreen();
}

/** Waits for a figure to appear, which it only does once it has been stored. */
function findStat(label: string, amountMl: number) {
  return screen.findByLabelText(statLabel(label, amountMl));
}

/** A store whose writes wait until they are let through. */
function gatedStore(store: InMemoryKeyValueStore): {
  storage: HydrationStorage;
  release: () => void;
} {
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const gated: KeyValueStore = {
    read: (key) => store.read(key),
    async write(key, value) {
      await gate;
      await store.write(key, value);
    },
  };

  return { storage: createHydrationStorage(gated), release: () => release() };
}

/** A store that refuses every write, as a full device would. */
function refusingStore(store: InMemoryKeyValueStore): HydrationStorage {
  return createHydrationStorage({
    read: (key) => store.read(key),
    write: () => Promise.reject(new Error('no space left on device')),
  });
}

/** Every host component in the rendered tree, for asserting on what is not there. */
function renderedTypes(node: unknown): string[] {
  if (node === null || typeof node !== 'object') {
    return [];
  }

  if (Array.isArray(node)) {
    return node.flatMap(renderedTypes);
  }

  const element = node as { type?: unknown; children?: unknown };

  return [
    ...(typeof element.type === 'string' ? [element.type] : []),
    ...renderedTypes(element.children),
  ];
}

afterEach(() => {
  jest.useRealTimers();
});

describe('logging a glass', () => {
  it.each(GLASS_SIZES_ML)('logs a %i ml glass in one press', async (amountMl) => {
    const store = createInMemoryKeyValueStore();
    await open(createInMemoryHydrationStorage(store));

    tapGlass(amountMl);

    await findStat(TOTAL_LABEL, amountMl);
    expectStat(REMAINING_LABEL, 2000 - amountMl);

    // Persisted, not merely shown: the day is in storage by the time the total
    // has changed on screen.
    const stored = await reopen(store).readDay(TODAY);
    expect(stored?.entries).toEqual([{ amountMl, loggedAt: NOW.toISOString() }]);
  });

  it('adds each glass to the running total', async () => {
    const store = createInMemoryKeyValueStore();
    await open(createInMemoryHydrationStorage(store));

    tapGlass(250);
    await findStat(TOTAL_LABEL, 250);
    tapGlass(500);
    await findStat(TOTAL_LABEL, 750);

    expectStat(REMAINING_LABEL, 1250);
    expect(totalMl((await reopen(store).readDay(TODAY))!)).toBe(750);
  });

  it('does not show the glass until it has been stored', async () => {
    const store = createInMemoryKeyValueStore();
    const { storage, release } = gatedStore(store);
    await open(storage);

    tapGlass(250);
    // Everything that can proceed without the write has proceeded.
    await act(async () => {});

    expect(store.snapshot()).toEqual({});
    expectStat(TOTAL_LABEL, 0);

    release();

    await findStat(TOTAL_LABEL, 250);
    expect(totalMl((await reopen(store).readDay(TODAY))!)).toBe(250);
  });

  it('logs both glasses when two are tapped in quick succession', async () => {
    const store = createInMemoryKeyValueStore();
    await open(createInMemoryHydrationStorage(store));

    tapGlass(250);
    tapGlass(500);

    await findStat(TOTAL_LABEL, 750);
    expect((await reopen(store).readDay(TODAY))?.entries).toHaveLength(2);
  });

  it('reports the goal as met, with nothing remaining, once it is reached', async () => {
    const store = createInMemoryKeyValueStore();
    const storage = createInMemoryHydrationStorage(store);
    await storage.writeGoal(createGoal(500));
    await open(storage);

    tapGlass(500);
    await findStat(TOTAL_LABEL, 500);

    expect(screen.getByText(GOAL_MET_MESSAGE)).toBeOnTheScreen();
    expectStat(REMAINING_LABEL, 0);

    // Overshooting leaves nothing remaining rather than a negative amount.
    tapGlass(200);
    await findStat(TOTAL_LABEL, 700);
    expectStat(REMAINING_LABEL, 0);
  });
});

describe('undoing a glass', () => {
  it('removes the most recent glass and restores the previous total', async () => {
    const store = createInMemoryKeyValueStore();
    await open(createInMemoryHydrationStorage(store));

    tapGlass(250);
    await findStat(TOTAL_LABEL, 250);
    tapGlass(500);
    await findStat(TOTAL_LABEL, 750);

    tapUndo();

    await findStat(TOTAL_LABEL, 250);
    expectStat(REMAINING_LABEL, 1750);

    const stored = await reopen(store).readDay(TODAY);
    expect(stored?.entries).toEqual([{ amountMl: 250, loggedAt: NOW.toISOString() }]);
  });

  it('persists the undo, so reopening does not bring the glass back', async () => {
    const store = createInMemoryKeyValueStore();
    await open(createInMemoryHydrationStorage(store));

    tapGlass(330);
    await findStat(TOTAL_LABEL, 330);
    tapUndo();
    await findStat(TOTAL_LABEL, 0);

    screen.unmount();
    await open(reopen(store));

    expectStat(TOTAL_LABEL, 0);
  });

  it('offers nothing to undo, and writes nothing, on a day with no glasses', async () => {
    const store = createInMemoryKeyValueStore();
    await open(createInMemoryHydrationStorage(store));

    expect(screen.getByRole('button', { name: UNDO_LABEL })).toBeDisabled();

    tapUndo();
    await act(async () => {});

    // Nothing raised, and no record written for a day nothing happened on.
    expect(store.snapshot()).toEqual({});
    expectStat(TOTAL_LABEL, 0);
    expect(screen.queryByText(WRITE_FAILED_MESSAGE)).toBeNull();
  });
});

describe('where the day stands', () => {
  it('shows the total, the goal and the remaining amount at once', async () => {
    const store = createInMemoryKeyValueStore();
    const storage = createInMemoryHydrationStorage(store);
    await storage.writeGoal(createGoal(2500));
    await storage.writeDay(
      createDay(TODAY, createGoal(2500), [createEntry(400, NOW)]),
    );

    await open(storage);

    expectStat(TOTAL_LABEL, 400);
    expectStat(GOAL_LABEL, 2500);
    expectStat(REMAINING_LABEL, 2100);

    // All three are on screen together rather than something to scroll to.
    expect(renderedTypes(screen.toJSON()).filter((type) => /scroll/i.test(type))).toEqual(
      [],
    );
  });

  it('judges today against the goal stored with the day', async () => {
    const store = createInMemoryKeyValueStore();
    const storage = createInMemoryHydrationStorage(store);
    // The goal in force has since been raised; the day keeps the one it was
    // logged against, per docs/functional-spec.md, "The daily goal".
    await storage.writeGoal(createGoal(3000));
    await storage.writeDay(createDay(TODAY, createGoal(1500), [createEntry(500, NOW)]));

    await open(storage);

    expectStat(GOAL_LABEL, 1500);
    expectStat(REMAINING_LABEL, 1000);
  });

  it('uses the goal in force on a day nothing has been logged against', async () => {
    const storage = createInMemoryHydrationStorage();
    await storage.writeGoal(createGoal(2400));

    await open(storage);

    expectStat(TOTAL_LABEL, 0);
    expectStat(GOAL_LABEL, 2400);
    expectStat(REMAINING_LABEL, 2400);
  });

  it('shows the same total when the app is reopened on the same day', async () => {
    const store = createInMemoryKeyValueStore();
    await open(createInMemoryHydrationStorage(store));

    tapGlass(500);
    await findStat(TOTAL_LABEL, 500);
    tapGlass(250);
    await findStat(TOTAL_LABEL, 750);

    // The app closes here, and opens again over what it wrote.
    screen.unmount();
    await open(reopen(store));

    expectStat(TOTAL_LABEL, 750);
    expectStat(REMAINING_LABEL, 1250);
  });
});

describe('the day boundary', () => {
  it('starts the new day at zero while the app is left open', async () => {
    jest.useFakeTimers();

    const store = createInMemoryKeyValueStore();
    let at = NOW;
    const clock = () => at;

    render(<TodayScreen storage={createInMemoryHydrationStorage(store)} now={clock} />);
    await findStat(TOTAL_LABEL, 0);

    tapGlass(500);
    await findStat(TOTAL_LABEL, 500);

    // Midnight passes with the screen still on.
    at = hoursAfter(24);
    await act(async () => {
      jest.advanceTimersByTime(DATE_CHECK_INTERVAL_MS);
    });

    await findStat(TOTAL_LABEL, 0);
    expectStat(REMAINING_LABEL, 2000);

    // Yesterday is retained under its own key, entries and goal intact.
    const yesterday = await reopen(store).readDay(TODAY);
    expect(yesterday?.entries).toEqual([{ amountMl: 500, loggedAt: NOW.toISOString() }]);
    expect(yesterday?.goal).toEqual({ amountMl: 2000 });
    expect(await reopen(store).readDay(TOMORROW)).toBeNull();
  });

  it('logs a glass tapped after midnight against the new day', async () => {
    const store = createInMemoryKeyValueStore();
    let at = NOW;
    const clock = () => at;

    render(<TodayScreen storage={createInMemoryHydrationStorage(store)} now={clock} />);
    await findStat(TOTAL_LABEL, 0);

    tapGlass(500);
    await findStat(TOTAL_LABEL, 500);

    at = hoursAfter(24);
    tapGlass(250);

    // The new glass starts the new day rather than joining yesterday's total.
    await findStat(TOTAL_LABEL, 250);
    expect(totalMl((await reopen(store).readDay(TOMORROW))!)).toBe(250);
    expect(totalMl((await reopen(store).readDay(TODAY))!)).toBe(500);
  });

  it('opens the next day at zero with the previous day kept in history', async () => {
    const store = createInMemoryKeyValueStore();
    await open(createInMemoryHydrationStorage(store));

    tapGlass(500);
    await findStat(TOTAL_LABEL, 500);
    const yesterdayAsWritten = store.snapshot();

    // The app closes, and opens again on the following day.
    screen.unmount();
    await open(reopen(store), tomorrow);

    expectStat(TOTAL_LABEL, 0);
    expectStat(REMAINING_LABEL, 2000);
    // Nothing was rewritten by opening on the new day: history is byte-for-byte
    // what yesterday left behind.
    expect(store.snapshot()).toEqual(yesterdayAsWritten);
    expect(totalMl((await reopen(store).readDay(TODAY))!)).toBe(500);
  });
});

describe('when storage refuses the write', () => {
  it('says so and leaves the total showing what is actually stored', async () => {
    const store = createInMemoryKeyValueStore();
    await open(refusingStore(store));

    tapGlass(250);

    expect(await screen.findByText(WRITE_FAILED_MESSAGE)).toBeOnTheScreen();
    expectStat(TOTAL_LABEL, 0);
    expect(store.snapshot()).toEqual({});
  });
});
