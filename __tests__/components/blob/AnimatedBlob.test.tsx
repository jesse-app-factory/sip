/**
 * The blob in motion: what moves, when it moves, how long it takes, and what
 * happens when the operating system has asked for less of it.
 *
 * docs/testing-strategy.md, "Animation", is explicit about what is testable
 * here: "that a transition is used rather than a direct assignment, that the
 * exported duration constants are the ones the triggers reference, that
 * reaching the goal fires a different animation from ordinary growth, that
 * reduce-motion skips to the final value" — and equally explicit that whether
 * it looks good is not.
 *
 * Every assertion below reads the value Reanimated actually drove, through
 * `getAnimatedStyle`, after advancing Jest's fake clock. That is what makes
 * "over time" a fact rather than an intention: the size is read at several
 * moments, and it is different at each of them.
 *
 * The growth and the celebration are carried by two different views, so a test
 * asking "did it celebrate" is never answered by the blob merely growing.
 */
import { render, screen } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';

import {
  ANIMATED_BLOB_TEST_ID,
  AnimatedBlob,
  BLOB_CELEBRATION_TEST_ID,
  BLOB_HAPPY_TEST_ID,
  blobSize,
  CELEBRATION_DURATION_MS,
  CELEBRATION_PULSES,
  CELEBRATION_SCALE,
  CELEBRATION_STEP_MS,
  GROWTH_DURATION_MS,
  RESTING_SCALE,
} from '../../../src/components/blob';

/** One frame at 60fps, which is the smallest step that means anything here. */
const FRAME_MS = 16;

function animatedStyle(testID: string): Record<string, unknown> {
  return getAnimatedStyle(screen.getByTestId(testID)) as unknown as Record<
    string,
    unknown
  >;
}

/** The size the blob has actually reached, as the renderer sees it. */
function size(): number {
  return animatedStyle(ANIMATED_BLOB_TEST_ID).width as number;
}

/** How far through its celebration the blob is: 1 when it is not celebrating. */
function celebration(): number {
  const { transform } = animatedStyle(BLOB_CELEBRATION_TEST_ID) as {
    transform: readonly { scale: number }[];
  };

  return transform[0].scale;
}

/** Advances the clock and reports where the blob got to. */
function after(ms: number): { size: number; celebration: number } {
  jest.advanceTimersByTime(ms);

  return { size: size(), celebration: celebration() };
}

function show(progress: number, reduceMotion = false): void {
  render(<AnimatedBlob mood="calm" progress={progress} reduceMotion={reduceMotion} />);
}

function changeTo(progress: number, reduceMotion = false): void {
  screen.rerender(
    <AnimatedBlob mood="calm" progress={progress} reduceMotion={reduceMotion} />,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('growing', () => {
  it('starts at the size its progress deserves, without animating into it', () => {
    // Opening the app on a day already half drunk shows a half-grown blob, not
    // an empty one that fills up.
    show(0.5);

    expect(size()).toBeCloseTo(blobSize(0.5), 5);
  });

  it('has not reached the new size on the frame after progress changed', () => {
    show(0.25);
    changeTo(0.75);

    const first = after(FRAME_MS);

    // The whole of the criterion, in one assertion: a value that changed in a
    // single frame would already be `blobSize(0.75)` here.
    expect(first.size).toBeGreaterThan(blobSize(0.25));
    expect(first.size).toBeLessThan(blobSize(0.75));
  });

  it('passes through several sizes on the way, none of them the last one', () => {
    show(0.25);
    changeTo(0.75);

    const step = GROWTH_DURATION_MS / 5;
    const along = [after(step).size, after(step).size, after(step).size, after(step).size];

    // Strictly increasing, so this is a transition rather than a jump followed
    // by a wait, and every value is between the two progresses.
    expect(along).toEqual([...along].sort((a, b) => a - b));
    expect(new Set(along).size).toBe(along.length);
    for (const value of along) {
      expect(value).toBeGreaterThan(blobSize(0.25));
      expect(value).toBeLessThan(blobSize(0.75));
    }
  });

  it('shrinks over time too, when the goal is raised past the total', () => {
    show(1);
    changeTo(0.4);

    const halfway = after(GROWTH_DURATION_MS / 2).size;

    expect(halfway).toBeLessThan(blobSize(1));
    expect(halfway).toBeGreaterThan(blobSize(0.4));
    expect(after(GROWTH_DURATION_MS / 2).size).toBeCloseTo(blobSize(0.4), 5);
  });

  it('retargets rather than restarting when a second glass arrives mid-growth', () => {
    show(0);
    changeTo(0.5);

    const interrupted = after(GROWTH_DURATION_MS / 2).size;
    changeTo(1);

    // It carries on from where it had got to — it does not snap back to the
    // size it started from, and it does not jump to the new one.
    const next = after(FRAME_MS);
    expect(next.size).toBeGreaterThan(interrupted);
    expect(next.size).toBeLessThan(blobSize(1));

    expect(after(GROWTH_DURATION_MS).size).toBeCloseTo(blobSize(1), 5);
  });

  it('does not restart when the screen re-renders with the same progress', () => {
    show(0);
    changeTo(0.5);

    const reached = after(GROWTH_DURATION_MS / 2).size;
    changeTo(0.5);

    expect(after(FRAME_MS).size).toBeGreaterThan(reached);
  });
});

describe('the growth duration', () => {
  it('is over exactly at GROWTH_DURATION_MS, and not before', () => {
    show(0.25);
    changeTo(1);

    // A frame short of the constant it is still moving, so the trigger is
    // using this duration and not a shorter one of its own.
    expect(after(GROWTH_DURATION_MS - FRAME_MS).size).toBeLessThan(blobSize(1));
    expect(after(FRAME_MS).size).toBeCloseTo(blobSize(1), 5);
  });

  it('is the same duration whichever direction the blob moves', () => {
    show(1);
    changeTo(0);

    expect(after(GROWTH_DURATION_MS - FRAME_MS).size).toBeGreaterThan(blobSize(0));
    expect(after(FRAME_MS).size).toBeCloseTo(blobSize(0), 5);
  });
});

describe('celebrating', () => {
  it('is at rest while the blob is merely growing', () => {
    show(0.25);
    changeTo(0.75);

    const step = GROWTH_DURATION_MS / 4;
    const along = [
      celebration(),
      after(step).celebration,
      after(step).celebration,
      after(step).celebration,
      after(step).celebration,
    ];

    // Growth alone never produces this movement, which is what makes the
    // celebration distinct from it rather than a larger version of it.
    expect(along).toEqual(along.map(() => RESTING_SCALE));
  });

  it('swells past its resting scale when the goal is reached', () => {
    show(0.75);
    changeTo(1);

    expect(after(CELEBRATION_STEP_MS).celebration).toBeCloseTo(CELEBRATION_SCALE, 5);
  });

  it('bounces CELEBRATION_PULSES times and ends back at rest', () => {
    show(0.75);
    changeTo(1);

    const peaks: number[] = [];
    for (let pulse = 0; pulse < CELEBRATION_PULSES; pulse += 1) {
      peaks.push(after(CELEBRATION_STEP_MS).celebration);
      expect(after(CELEBRATION_STEP_MS).celebration).toBeCloseTo(RESTING_SCALE, 5);
    }

    expect(peaks).toHaveLength(CELEBRATION_PULSES);
    for (const peak of peaks) {
      expect(peak).toBeCloseTo(CELEBRATION_SCALE, 5);
    }
  });

  it('is still moving a frame before CELEBRATION_DURATION_MS and over at it', () => {
    show(0.75);
    changeTo(1);

    expect(after(CELEBRATION_DURATION_MS - FRAME_MS).celebration).toBeGreaterThan(
      RESTING_SCALE,
    );
    expect(after(FRAME_MS).celebration).toBeCloseTo(RESTING_SCALE, 5);
  });

  it('outlasts the growth it happens alongside', () => {
    // Reaching the goal grows the blob as well; the celebration is what is
    // still on screen once that growth has finished.
    show(0.75);
    changeTo(1);

    jest.advanceTimersByTime(GROWTH_DURATION_MS);

    expect(size()).toBeCloseTo(blobSize(1), 5);
    expect(celebration()).not.toBe(RESTING_SCALE);
  });

  it('does not run again for a glass logged after the goal was met', () => {
    show(0.75);
    changeTo(1);
    jest.advanceTimersByTime(CELEBRATION_DURATION_MS);

    // Progress is clamped at 1, so a further glass leaves the blob happy and
    // the celebration where it finished.
    changeTo(1);
    const along = [
      after(CELEBRATION_STEP_MS).celebration,
      after(CELEBRATION_STEP_MS).celebration,
    ];

    expect(along).toEqual([RESTING_SCALE, RESTING_SCALE]);
  });

  it('celebrates again if the goal is met, lost and met once more', () => {
    // Raising the goal part-way through the day can put the blob back below
    // it; meeting it a second time is worth marking a second time.
    show(1);
    jest.advanceTimersByTime(CELEBRATION_DURATION_MS);

    changeTo(0.5);
    jest.advanceTimersByTime(GROWTH_DURATION_MS);
    expect(celebration()).toBe(RESTING_SCALE);

    changeTo(1);
    expect(after(CELEBRATION_STEP_MS).celebration).toBeCloseTo(CELEBRATION_SCALE, 5);
  });
});

describe('with reduce motion enabled', () => {
  it('is at the new size on the frame the progress changed', () => {
    show(0.25, true);
    changeTo(0.75, true);

    // No clock has been advanced between the change and this assertion.
    expect(size()).toBeCloseTo(blobSize(0.75), 5);
  });

  it('skips to the final value rather than animating faster', () => {
    show(0.25, true);
    changeTo(0.75, true);

    // Nothing changes as time passes, because nothing was left to do.
    const along = [after(FRAME_MS).size, after(GROWTH_DURATION_MS).size];

    expect(along).toEqual([blobSize(0.75), blobSize(0.75)]);
  });

  it('does not celebrate reaching the goal, and shows the happy blob at once', () => {
    show(0.75, true);
    changeTo(1, true);

    expect(size()).toBeCloseTo(blobSize(1), 5);
    expect(celebration()).toBe(RESTING_SCALE);
    // The final *state*, not merely the final size: the happy variant is on
    // screen with no animation having run.
    expect(screen.getByTestId(BLOB_HAPPY_TEST_ID)).toBeOnTheScreen();

    const along = [after(CELEBRATION_STEP_MS).celebration, after(FRAME_MS).celebration];
    expect(along).toEqual([RESTING_SCALE, RESTING_SCALE]);
  });

  it('takes the setting turning on mid-day as the end of animating', () => {
    show(0.25);
    changeTo(0.75, true);

    expect(size()).toBeCloseTo(blobSize(0.75), 5);
  });
});
