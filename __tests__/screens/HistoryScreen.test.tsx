/**
 * The last seven days and the current streak, as the user reads them.
 *
 * The screen is rendered over the in-memory storage from TASK-003 and the
 * clock is injected, per docs/testing-strategy.md, "Screen tests" and "Time" —
 * no test here reaches AsyncStorage or the real clock, and which day is
 * "today" is decided by the test rather than by when it runs.
 */
import { act, render, screen } from '@testing-library/react-native';

import {
  createDay,
  createEntry,
  createGoal,
  HISTORY_DAYS,
  HistoryDay,
  shiftLocalDate,
  toLocalDate,
} from '../../src/domain';
import {
  DATE_CHECK_INTERVAL_MS,
  DAY_MET_MARK,
  EMPTY_HISTORY_MESSAGE,
  formatHistoryDate,
  HistoryScreen,
  historyDayLabel,
  NOTHING_LOGGED_MESSAGE,
  streakSummary,
} from '../../src/screens';
import { createInMemoryHydrationStorage, HydrationStorage } from '../../src/storage';

/** A fixed moment, so which day is "today" never depends on when this runs. */
const NOW = new Date(2026, 7, 18, 10, 0, 0);
const TODAY = toLocalDate(NOW);

/** Stable across renders, so the screen's date check is not resubscribed. */
const now = () => NOW;

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

/** Renders the screen and waits for history to arrive from storage. */
async function open(target: HydrationStorage, clock: () => Date = now) {
  render(<HistoryScreen storage={target} now={clock} />);

  await screen.findByText(/streak/i);
}

/**
 * What one row reads as. A day is recorded with no goal and nothing logged
 * unless the test says otherwise, so each expectation names only the fields it
 * is actually about.
 */
function rowLabel(day: {
  readonly date: string;
  readonly recorded?: boolean;
  readonly totalMl?: number;
  readonly goalMl?: number | null;
  readonly met?: boolean;
}): string {
  const row: HistoryDay = {
    recorded: true,
    totalMl: 0,
    goalMl: null,
    met: false,
    ...day,
  };

  return historyDayLabel(row);
}

afterEach(() => {
  jest.useRealTimers();
});

describe('the last seven days', () => {
  it('lists seven days, most recent first', async () => {
    await open(storage());

    for (let back = 0; back < HISTORY_DAYS; back += 1) {
      expect(screen.getByText(formatHistoryDate(daysAgo(back)))).toBeOnTheScreen();
    }

    expect(screen.queryByText(formatHistoryDate(daysAgo(HISTORY_DAYS)))).not.toBeOnTheScreen();
  });

  it('shows each day’s total against the goal that applied on that day', async () => {
    const target = storage();
    await write(target, 0, 800, 3000);
    await write(target, 3, 1500, 1500);

    await open(target);

    expect(
      screen.getByLabelText(
        rowLabel({ date: TODAY, totalMl: 800, goalMl: 3000, met: false }),
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText(
        rowLabel({ date: daysAgo(3), totalMl: 1500, goalMl: 1500, met: true }),
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('1500 ml of 1500 ml')).toBeOnTheScreen();
  });

  it('does not judge a past day against a goal raised since', async () => {
    const target = storage();
    await write(target, 1, 1500, 1500);
    await target.writeGoal(createGoal(3000));

    await open(target);

    // Yesterday is still a success, shown against the 1500 ml it was judged
    // against rather than against today's 3000 ml.
    expect(
      screen.getByLabelText(
        rowLabel({ date: daysAgo(1), totalMl: 1500, goalMl: 1500, met: true }),
      ),
    ).toBeOnTheScreen();
    expect(screen.getAllByText(DAY_MET_MARK)).toHaveLength(1);
  });

  it('shows a day with no recorded data as having nothing logged', async () => {
    await open(storage());

    expect(screen.getAllByText(NOTHING_LOGGED_MESSAGE)).toHaveLength(HISTORY_DAYS);
    expect(
      screen.getByLabelText(rowLabel({ date: TODAY, recorded: false })),
    ).toBeOnTheScreen();
  });

  it('distinguishes a recorded day with no glasses from one with no data', async () => {
    const target = storage();
    await write(target, 1, 0, 2000);

    await open(target);

    expect(
      screen.getByLabelText(rowLabel({ date: daysAgo(1), totalMl: 0, goalMl: 2000 })),
    ).toBeOnTheScreen();
    expect(screen.getByText('0 ml of 2000 ml')).toBeOnTheScreen();
  });

  it('renders a history with no days at all without error', async () => {
    await open(storage());

    expect(screen.getByText(EMPTY_HISTORY_MESSAGE)).toBeOnTheScreen();
    expect(screen.getByText(streakSummary(0))).toBeOnTheScreen();
    expect(screen.queryByText(DAY_MET_MARK)).not.toBeOnTheScreen();
  });

  it('moves the window on when the day turns over while the app is open', async () => {
    jest.useFakeTimers();

    const target = storage();
    await write(target, 0, 2000);

    let at = NOW;
    await open(target, () => at);

    at = new Date(2026, 7, 19, 0, 30, 0);
    await act(async () => {
      jest.advanceTimersByTime(DATE_CHECK_INTERVAL_MS);
    });

    // The new day heads the list, and the day that has dropped off the end is
    // no longer shown.
    expect(await screen.findByText(formatHistoryDate('2026-08-19'))).toBeOnTheScreen();
    expect(screen.queryByText(formatHistoryDate(daysAgo(6)))).not.toBeOnTheScreen();
    // Yesterday met its goal, so the streak survives midnight.
    expect(screen.getByText(streakSummary(1))).toBeOnTheScreen();
  });
});

describe('the current streak', () => {
  it('counts consecutive days meeting the goal, ending today', async () => {
    const target = storage();
    await write(target, 0, 2000);
    await write(target, 1, 2000);
    await write(target, 2, 2000);
    await write(target, 3, 100);

    await open(target);

    expect(screen.getByText(streakSummary(3))).toBeOnTheScreen();
    expect(screen.getByText('Current streak: 3 days')).toBeOnTheScreen();
  });

  it('counts a streak ending yesterday when today is still in progress', async () => {
    const target = storage();
    await write(target, 0, 500);
    await write(target, 1, 2000);

    await open(target);

    expect(screen.getByText('Current streak: 1 day')).toBeOnTheScreen();
  });

  it('counts today only once its goal has actually been met', async () => {
    const target = storage();
    await write(target, 1, 2000);
    await write(target, 0, 1999);

    await open(target);

    expect(screen.getByText(streakSummary(1))).toBeOnTheScreen();

    screen.unmount();
    await write(target, 0, 2000);
    await open(target);

    expect(screen.getByText(streakSummary(2))).toBeOnTheScreen();
  });

  it('is broken by a day with no recorded data rather than skipping it', async () => {
    const target = storage();
    await write(target, 0, 2000);
    // Nothing at all for yesterday.
    await write(target, 2, 2000);
    await write(target, 3, 2000);

    await open(target);

    expect(screen.getByText(streakSummary(1))).toBeOnTheScreen();
  });

  it('renders a streak of zero without error', async () => {
    const target = storage();
    await write(target, 0, 100);
    await write(target, 1, 100);

    await open(target);

    expect(screen.getByText(streakSummary(0))).toBeOnTheScreen();
    expect(screen.getByText('No streak yet. Meet the goal today to start one.')).toBeOnTheScreen();
  });
});

describe('how history reads', () => {
  it('names a date without depending on the locale of the machine', () => {
    expect(formatHistoryDate('2026-08-18')).toBe('Tue 18 Aug');
    expect(formatHistoryDate('2026-01-05')).toBe('Mon 5 Jan');
  });

  it('reads a day, its figures and its verdict as one label', () => {
    expect(rowLabel({ date: '2026-08-18', totalMl: 2000, goalMl: 2000, met: true })).toBe(
      'Tue 18 Aug: 2000 ml of 2000 ml, goal met',
    );
    expect(rowLabel({ date: '2026-08-18', recorded: false })).toBe(
      'Tue 18 Aug: Nothing logged, goal not met',
    );
  });

  it('says nobody has a streak rather than printing a zero', () => {
    expect(streakSummary(0)).not.toMatch(/0/);
    expect(streakSummary(1)).toBe('Current streak: 1 day');
    expect(streakSummary(2)).toBe('Current streak: 2 days');
  });
});
