/**
 * The blob on the screen that logs glasses: what a glass does to it, and what
 * it does not do to the glass.
 *
 * `AnimatedBlob.test.tsx` covers the motion itself against props. What only
 * the screen can show is the wiring docs/architecture.md describes in "Data
 * flow, logging a glass" — the screen "recomputes progress and passes it to
 * the blob, which animates" — and the requirement that stands directly
 * opposite it, docs/functional-spec.md, "Animation": "Animation never blocks
 * interaction. A second glass can be logged while an animation from the first
 * is still running."
 *
 * That last one is asserted the only way it can honestly be asserted: with the
 * first glass's growth genuinely half-finished — the clock stopped between two
 * frames of it — a second glass is tapped, and both are on screen and in
 * storage afterwards.
 *
 * Storage is the in-memory implementation and the clock is injected, per
 * docs/testing-strategy.md. Time is Jest's, so the animation is advanced
 * rather than waited for, and the reduce-motion setting is the platform module
 * spied on, because CI has no phone whose setting could be turned on.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { getAnimatedStyle } from 'react-native-reanimated';

import {
  ANIMATED_BLOB_TEST_ID,
  BLOB_CELEBRATION_TEST_ID,
  BLOB_HAPPY_TEST_ID,
  blobSize,
  CELEBRATION_STEP_MS,
  GROWTH_DURATION_MS,
  RESTING_SCALE,
} from '../../src/components';
import { createGoal, toLocalDate, totalMl } from '../../src/domain';
import {
  glassButtonLabel,
  statLabel,
  TodayScreen,
  TOTAL_LABEL,
  UNDO_LABEL,
} from '../../src/screens';
import {
  createInMemoryHydrationStorage,
  createInMemoryKeyValueStore,
  HydrationStorage,
  InMemoryKeyValueStore,
} from '../../src/storage';

/** A fixed moment, so which day is "today" never depends on when this runs. */
const NOW = new Date('2026-08-18T10:00:00.000Z');
const now = () => NOW;
const TODAY = toLocalDate(NOW);

/** The size the blob has actually reached, as the renderer sees it. */
function size(): number {
  return (
    getAnimatedStyle(screen.getByTestId(ANIMATED_BLOB_TEST_ID)) as unknown as {
      width: number;
    }
  ).width;
}

/** How far through its celebration the blob is: 1 when it is not celebrating. */
function celebration(): number {
  const { transform } = getAnimatedStyle(
    screen.getByTestId(BLOB_CELEBRATION_TEST_ID),
  ) as unknown as { transform: readonly { scale: number }[] };

  return transform[0].scale;
}

function tapGlass(amountMl: number): void {
  fireEvent.press(screen.getByRole('button', { name: glassButtonLabel(amountMl) }));
}

function tapUndo(): void {
  fireEvent.press(screen.getByRole('button', { name: UNDO_LABEL }));
}

function findStat(label: string, amountMl: number) {
  return screen.findByLabelText(statLabel(label, amountMl));
}

/** What is in storage for today, whatever is on screen. */
async function storedTotal(store: InMemoryKeyValueStore): Promise<number> {
  const day = await createInMemoryHydrationStorage(store).readDay(TODAY);

  return day === null ? 0 : totalMl(day);
}

/** A storage holding a goal, with nothing logged against today yet. */
async function withGoalOf(amountMl: number): Promise<{
  storage: HydrationStorage;
  store: InMemoryKeyValueStore;
}> {
  const store = createInMemoryKeyValueStore();
  const storage = createInMemoryHydrationStorage(store);
  await storage.writeGoal(createGoal(amountMl));

  return { storage, store };
}

async function open(storage: HydrationStorage): Promise<void> {
  render(<TodayScreen now={now} storage={storage} />);
  await findStat(TOTAL_LABEL, 0);
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the blob on the today screen', () => {
  it('is shown at the size the day has earned', async () => {
    const { storage } = await withGoalOf(1000);
    await open(storage);

    // Nothing logged, so nothing grown.
    expect(size()).toBeCloseTo(blobSize(0), 5);
  });

  it('grows towards the new progress when a glass is logged', async () => {
    const { storage } = await withGoalOf(1000);
    await open(storage);

    tapGlass(500);
    await findStat(TOTAL_LABEL, 500);

    // Part-way: the glass is on screen, and the blob is on its way to the size
    // that glass earned rather than already there.
    const started = size();
    expect(started).toBeGreaterThanOrEqual(blobSize(0));
    expect(started).toBeLessThan(blobSize(0.5));

    await act(async () => jest.advanceTimersByTime(GROWTH_DURATION_MS));
    expect(size()).toBeCloseTo(blobSize(0.5), 5);
  });

  it('celebrates the glass that meets the goal', async () => {
    const { storage } = await withGoalOf(500);
    await open(storage);

    tapGlass(500);
    await findStat(TOTAL_LABEL, 500);
    await act(async () => jest.advanceTimersByTime(CELEBRATION_STEP_MS));

    expect(celebration()).toBeGreaterThan(RESTING_SCALE);
    expect(screen.getByTestId(BLOB_HAPPY_TEST_ID)).toBeOnTheScreen();
  });

  it('does not celebrate a glass that leaves the goal unmet', async () => {
    const { storage } = await withGoalOf(1000);
    await open(storage);

    tapGlass(500);
    await findStat(TOTAL_LABEL, 500);
    await act(async () => jest.advanceTimersByTime(CELEBRATION_STEP_MS));

    expect(celebration()).toBe(RESTING_SCALE);
    expect(screen.queryByTestId(BLOB_HAPPY_TEST_ID)).toBeNull();
  });
});

describe('logging while the blob is still moving', () => {
  it('logs the second glass and stores it', async () => {
    const { storage, store } = await withGoalOf(1000);
    await open(storage);

    tapGlass(250);
    await findStat(TOTAL_LABEL, 250);

    // Stopped mid-growth: this is the state the criterion is about. The blob
    // has left the size it started at and has not reached the new one.
    await act(async () => jest.advanceTimersByTime(GROWTH_DURATION_MS / 3));
    const mid = size();
    expect(mid).toBeGreaterThan(blobSize(0));
    expect(mid).toBeLessThan(blobSize(0.25));

    tapGlass(250);

    await findStat(TOTAL_LABEL, 500);
    expect(await storedTotal(store)).toBe(500);
  });

  it('carries on to the size the second glass earned', async () => {
    const { storage } = await withGoalOf(1000);
    await open(storage);

    tapGlass(250);
    await findStat(TOTAL_LABEL, 250);
    await act(async () => jest.advanceTimersByTime(GROWTH_DURATION_MS / 3));

    tapGlass(250);
    await findStat(TOTAL_LABEL, 500);
    await act(async () => jest.advanceTimersByTime(GROWTH_DURATION_MS));

    expect(size()).toBeCloseTo(blobSize(0.5), 5);
  });

  it('undoes a glass mid-animation, and shrinks back', async () => {
    const { storage, store } = await withGoalOf(1000);
    await open(storage);

    tapGlass(500);
    await findStat(TOTAL_LABEL, 500);
    await act(async () => jest.advanceTimersByTime(GROWTH_DURATION_MS / 3));

    tapUndo();

    await findStat(TOTAL_LABEL, 0);
    expect(await storedTotal(store)).toBe(0);

    await act(async () => jest.advanceTimersByTime(GROWTH_DURATION_MS));
    expect(size()).toBeCloseTo(blobSize(0), 5);
  });

  it('still logs a glass with the goal-reaching celebration running', async () => {
    const { storage, store } = await withGoalOf(500);
    await open(storage);

    tapGlass(500);
    await findStat(TOTAL_LABEL, 500);
    await act(async () => jest.advanceTimersByTime(CELEBRATION_STEP_MS));
    expect(celebration()).toBeGreaterThan(RESTING_SCALE);

    tapGlass(250);

    await findStat(TOTAL_LABEL, 750);
    expect(await storedTotal(store)).toBe(750);
  });
});

describe('with the platform asking for reduced motion', () => {
  it('shows the glass at its final size with no animation', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    const { storage } = await withGoalOf(1000);
    await open(storage);

    tapGlass(500);
    await findStat(TOTAL_LABEL, 500);

    // No clock advanced since the glass appeared: the blob is already there.
    expect(size()).toBeCloseTo(blobSize(0.5), 5);
    expect(celebration()).toBe(RESTING_SCALE);
  });

  it('shows the happy blob without celebrating when the goal is met', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    const { storage } = await withGoalOf(500);
    await open(storage);

    tapGlass(500);
    await findStat(TOTAL_LABEL, 500);

    expect(size()).toBeCloseTo(blobSize(1), 5);
    expect(screen.getByTestId(BLOB_HAPPY_TEST_ID)).toBeOnTheScreen();

    await act(async () => jest.advanceTimersByTime(CELEBRATION_STEP_MS));
    expect(celebration()).toBe(RESTING_SCALE);
  });
});
