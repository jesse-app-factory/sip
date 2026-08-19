/**
 * Setting the daily goal, and changing it while the day is already under way.
 *
 * Every test here renders the screen over the in-memory storage from
 * TASK-003, per docs/testing-strategy.md, "Screen tests": render with fake
 * storage and assert on what the user would see and what was persisted. No
 * test in this directory calls AsyncStorage — `storageInterface.test.ts`
 * asserts that of the sources as well as of these tests.
 *
 * Closing and reopening the app is modelled the way the storage suite models
 * it: a second `HydrationStorage` built over the store the first one wrote to.
 * The process is gone, the stored strings are not.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  createDay,
  createEntry,
  createGoal,
  DEFAULT_GOAL_ML,
  Entry,
  toLocalDate,
  totalMl,
} from '../../src/domain';
import {
  EMPTY_GOAL_MESSAGE,
  GOAL_INPUT_LABEL,
  GoalScreen,
  NOT_A_NUMBER_MESSAGE,
  NOT_POSITIVE_MESSAGE,
  NOT_WHOLE_MESSAGE,
  parseGoalInput,
  SAVED_MESSAGE,
} from '../../src/screens';
import {
  createInMemoryHydrationStorage,
  createInMemoryKeyValueStore,
  dayKey,
  GOAL_KEY,
  HydrationStorage,
  InMemoryKeyValueStore,
} from '../../src/storage';

/** A fixed moment, so which day is "today" never depends on when this runs. */
const NOW = new Date('2026-08-18T10:00:00.000Z');
const now = () => NOW;

const hoursBefore = (hours: number): Date =>
  new Date(NOW.getTime() - hours * 60 * 60 * 1000);

// Derived from the injected clock rather than written out, so the dates match
// whatever time zone the machine running this happens to be in.
const TODAY = toLocalDate(NOW);
const YESTERDAY = toLocalDate(hoursBefore(24));

function reopen(store: InMemoryKeyValueStore): HydrationStorage {
  return createInMemoryHydrationStorage(store);
}

/** Renders the screen and waits for the stored goal to arrive on it. */
async function open(storage: HydrationStorage) {
  render(<GoalScreen storage={storage} now={now} />);

  await screen.findByDisplayValue(/\d/);
}

function type(text: string): void {
  fireEvent.changeText(screen.getByLabelText(GOAL_INPUT_LABEL), text);
}

function saveGoal(): void {
  fireEvent.press(screen.getByRole('button', { name: 'Save goal' }));
}

/** Two glasses logged today, against a 2000 ml goal. */
const LOGGED: readonly Entry[] = [
  createEntry(250, hoursBefore(3)),
  createEntry(500, hoursBefore(1)),
];

async function seedToday(storage: HydrationStorage): Promise<void> {
  await storage.writeGoal(createGoal(2000));
  await storage.writeDay(createDay(TODAY, createGoal(2000), LOGGED));
}

describe('reading the current goal', () => {
  it('shows the stored goal when the app is reopened', async () => {
    const store = createInMemoryKeyValueStore();
    await createInMemoryHydrationStorage(store).writeGoal(createGoal(2500));

    await open(reopen(store));

    expect(screen.getByText('Currently 2500 ml a day')).toBeOnTheScreen();
    expect(screen.getByLabelText(GOAL_INPUT_LABEL)).toHaveDisplayValue('2500');
  });

  it('shows the default goal until one has been set', async () => {
    await open(createInMemoryHydrationStorage());

    expect(screen.getByText(`Currently ${DEFAULT_GOAL_ML} ml a day`)).toBeOnTheScreen();
  });
});

describe('setting the goal', () => {
  it('persists it, and shows it as the current value when the app is reopened', async () => {
    const store = createInMemoryKeyValueStore();
    await open(createInMemoryHydrationStorage(store));

    type('2750');
    saveGoal();

    await screen.findByText(SAVED_MESSAGE);
    expect(screen.getByText('Currently 2750 ml a day')).toBeOnTheScreen();

    // The app closes here, and opens again over what it wrote.
    expect(await reopen(store).readGoal()).toEqual({ amountMl: 2750 });

    screen.unmount();
    await open(reopen(store));
    expect(screen.getByText('Currently 2750 ml a day')).toBeOnTheScreen();
  });

  it('accepts a goal typed with surrounding spaces', async () => {
    const store = createInMemoryKeyValueStore();
    await open(createInMemoryHydrationStorage(store));

    type('  1750  ');
    saveGoal();

    await screen.findByText(SAVED_MESSAGE);
    expect(await reopen(store).readGoal()).toEqual({ amountMl: 1750 });
  });

  it('writes no day record when nothing has been logged yet', async () => {
    const store = createInMemoryKeyValueStore();
    await open(createInMemoryHydrationStorage(store));

    type('2200');
    saveGoal();

    await screen.findByText(SAVED_MESSAGE);
    // "No data for this date" is a fact history needs; logging the first glass
    // is what turns today into a day that was lived through.
    expect(Object.keys(store.snapshot())).toEqual([GOAL_KEY]);
  });
});

describe('changing the goal part-way through a day', () => {
  it('leaves the entries already logged today untouched', async () => {
    const store = createInMemoryKeyValueStore();
    const storage = createInMemoryHydrationStorage(store);
    await seedToday(storage);

    await open(storage);
    type('3000');
    saveGoal();
    await screen.findByText(SAVED_MESSAGE);

    const today = await reopen(store).readDay(TODAY);
    expect(today).not.toBeNull();
    expect(today?.entries).toEqual(LOGGED);
    expect(totalMl(today!)).toBe(750);
  });

  it('applies the new goal to today', async () => {
    const store = createInMemoryKeyValueStore();
    const storage = createInMemoryHydrationStorage(store);
    await seedToday(storage);

    await open(storage);
    type('3000');
    saveGoal();
    await screen.findByText(SAVED_MESSAGE);

    expect(await reopen(store).readGoal()).toEqual({ amountMl: 3000 });
    expect((await reopen(store).readDay(TODAY))?.goal).toEqual({ amountMl: 3000 });
  });

  it('leaves days already in history exactly as they were', async () => {
    const store = createInMemoryKeyValueStore();
    const storage = createInMemoryHydrationStorage(store);
    await seedToday(storage);
    await storage.writeDay(
      createDay(YESTERDAY, createGoal(1500), [createEntry(400, hoursBefore(26))]),
    );
    const yesterdayAsWritten = store.snapshot()[dayKey(YESTERDAY)];

    await open(storage);
    type('3000');
    saveGoal();
    await screen.findByText(SAVED_MESSAGE);

    // Byte-for-byte: raising today's goal must not restate what yesterday was
    // judged against, per docs/functional-spec.md, "The daily goal".
    expect(store.snapshot()[dayKey(YESTERDAY)]).toBe(yesterdayAsWritten);
    expect((await reopen(store).readDay(YESTERDAY))?.goal).toEqual({ amountMl: 1500 });
  });
});

describe('rejecting input', () => {
  const rejected: readonly (readonly [string, string, string])[] = [
    ['zero', '0', NOT_POSITIVE_MESSAGE],
    ['a negative amount', '-500', NOT_POSITIVE_MESSAGE],
    ['a negative amount written with spaces', '  -1 ', NOT_POSITIVE_MESSAGE],
    ['letters', 'abc', NOT_A_NUMBER_MESSAGE],
    ['digits with a letter', '12a', NOT_A_NUMBER_MESSAGE],
    ['a thousands separator', '2,000', NOT_A_NUMBER_MESSAGE],
    ['a fraction of a millilitre', '1.5', NOT_WHOLE_MESSAGE],
    ['nothing at all', '', EMPTY_GOAL_MESSAGE],
    ['only spaces', '   ', EMPTY_GOAL_MESSAGE],
  ];

  it.each(rejected)('rejects %s on screen and writes nothing', async (_, input, message) => {
    const store = createInMemoryKeyValueStore();
    const storage = createInMemoryHydrationStorage(store);
    await seedToday(storage);
    const before = store.snapshot();

    await open(storage);
    type(input);
    saveGoal();

    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();

    // Nothing written: neither the goal key nor today's day moved.
    expect(store.snapshot()).toEqual(before);
    expect(await reopen(store).readGoal()).toEqual({ amountMl: 2000 });
    expect((await reopen(store).readDay(TODAY))?.entries).toEqual(LOGGED);
  });

  it('keeps showing the goal that is actually stored', async () => {
    const storage = createInMemoryHydrationStorage();
    await storage.writeGoal(createGoal(2400));

    await open(storage);
    type('0');
    saveGoal();

    await screen.findByText(NOT_POSITIVE_MESSAGE);
    expect(screen.getByText('Currently 2400 ml a day')).toBeOnTheScreen();
  });

  it('clears the message as soon as the field is edited again', async () => {
    await open(createInMemoryHydrationStorage());

    type('nope');
    saveGoal();
    await screen.findByText(NOT_A_NUMBER_MESSAGE);

    type('2000');

    expect(screen.queryByText(NOT_A_NUMBER_MESSAGE)).toBeNull();
  });

  it('accepts a corrected goal after a rejected one', async () => {
    const store = createInMemoryKeyValueStore();
    await open(createInMemoryHydrationStorage(store));

    type('-1');
    saveGoal();
    await screen.findByText(NOT_POSITIVE_MESSAGE);

    type('1800');
    saveGoal();

    await screen.findByText(SAVED_MESSAGE);
    expect(await reopen(store).readGoal()).toEqual({ amountMl: 1800 });
  });
});

describe('parseGoalInput', () => {
  it.each([
    ['2000', 2000],
    [' 2000 ', 2000],
    ['+2000', 2000],
    ['1', 1],
    ['2000.0', 2000],
  ])('reads %s as %i ml', (input, amountMl) => {
    expect(parseGoalInput(input)).toEqual({ amountMl });
  });

  it.each([
    ['', EMPTY_GOAL_MESSAGE],
    ['\t\n ', EMPTY_GOAL_MESSAGE],
    ['abc', NOT_A_NUMBER_MESSAGE],
    ['1e3', NOT_A_NUMBER_MESSAGE],
    ['0x10', NOT_A_NUMBER_MESSAGE],
    ['Infinity', NOT_A_NUMBER_MESSAGE],
    ['2 000', NOT_A_NUMBER_MESSAGE],
    ['0.5', NOT_WHOLE_MESSAGE],
    ['-2.5', NOT_WHOLE_MESSAGE],
    ['0', NOT_POSITIVE_MESSAGE],
    ['-0', NOT_POSITIVE_MESSAGE],
    ['-750', NOT_POSITIVE_MESSAGE],
  ])('rejects %s', (input, message) => {
    expect(parseGoalInput(input)).toEqual({ message });
  });
});
