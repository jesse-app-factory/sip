/**
 * The durations are constants, and the animations are driven by those
 * constants.
 *
 * docs/technical-spec.md, "Animation constraints": "Durations are exported
 * named constants rather than inline numbers, so tests can assert against them
 * and so tuning happens in one place." `AnimatedBlob.test.tsx` asserts the
 * behaviour those constants produce — that the growth is over exactly at
 * `GROWTH_DURATION_MS` and the celebration exactly at
 * `CELEBRATION_DURATION_MS`. That is most of the criterion, but not all of it:
 * a duration written out as a number inside the component would satisfy every
 * one of those assertions right up until somebody tuned the constant.
 *
 * So this file reads the component instead, the way
 * `__tests__/components/blob/source.test.ts` reads it for the properties a
 * render cannot show. Every duration it hands an animation must be one of the
 * names exported from `animation.ts`, and none of them may be a number.
 *
 * The file system is reached through `require` with the small shapes this
 * needs declared locally, because `@types/node` is not a dependency of this
 * project and this task may not add one.
 */
import {
  CELEBRATION_DURATION_MS,
  CELEBRATION_PULSES,
  CELEBRATION_SCALE,
  CELEBRATION_STEP_MS,
  GROWTH_DURATION_MS,
  RESTING_SCALE,
} from '../../../src/components/blob';

interface FileSystem {
  readFileSync(path: string, encoding: 'utf8'): string;
}

declare const require: (id: string) => unknown;
declare const __dirname: string;

const fs = require('fs') as FileSystem;

const BLOB = `${__dirname}/../../../src/components/blob`;
const animatedBlob = fs.readFileSync(`${BLOB}/AnimatedBlob.tsx`, 'utf8');
const animation = fs.readFileSync(`${BLOB}/animation.ts`, 'utf8');

/** The names `animation.ts` exports, which is where every number belongs. */
function exportedConstants(): string[] {
  return [...animation.matchAll(/^export const (\w+)/gm)].map((match) => match[1]);
}

/** Every value handed to an animation as `{ duration: ... }`. */
function durationsUsed(): string[] {
  return [...animatedBlob.matchAll(/duration:\s*([^\s,}]+)/g)].map((match) => match[1]);
}

describe('the durations', () => {
  it('are exported, named, and positive', () => {
    for (const duration of [
      GROWTH_DURATION_MS,
      CELEBRATION_DURATION_MS,
      CELEBRATION_STEP_MS,
    ]) {
      expect(typeof duration).toBe('number');
      expect(Number.isFinite(duration)).toBe(true);
      expect(duration).toBeGreaterThan(0);
    }
  });

  it('divide the celebration evenly into its pulses', () => {
    // Out and back, once per pulse, filling the whole duration: the step is
    // derived rather than a second number to keep in step with the first.
    expect(CELEBRATION_STEP_MS * CELEBRATION_PULSES * 2).toBe(CELEBRATION_DURATION_MS);
    expect(CELEBRATION_PULSES).toBeGreaterThan(0);
    expect(Number.isInteger(CELEBRATION_PULSES)).toBe(true);
  });

  it('describe a celebration that swells past the resting size', () => {
    expect(CELEBRATION_SCALE).toBeGreaterThan(RESTING_SCALE);
    expect(RESTING_SCALE).toBe(1);
  });
});

describe('the animated blob', () => {
  it('hands its animations named durations and never a number', () => {
    const used = durationsUsed();

    expect(used.length).toBeGreaterThan(0);
    for (const duration of used) {
      expect(duration).not.toMatch(/\d/);
      expect(exportedConstants()).toContain(duration);
    }
  });

  it('takes those names from animation.ts rather than declaring its own', () => {
    expect(animatedBlob).toMatch(/from '\.\/animation'/);
    // Every number the component would otherwise have written out — how far
    // the blob swells, how many times, and what it rests at — comes from the
    // same file as the durations.
    expect(animatedBlob).not.toMatch(/^const \w*(DURATION|_MS|SCALE|PULSES)\w* =/m);
    expect(animatedBlob).toMatch(/withTiming\(\s*CELEBRATION_SCALE/);
    expect(animatedBlob).toMatch(/withTiming\(\s*RESTING_SCALE/);
    expect(animatedBlob).toMatch(/CELEBRATION_PULSES,?\s*\)/);
  });

  it('animates nothing towards a number written into the component', () => {
    expect(animatedBlob).not.toMatch(/withTiming\(\s*[\d.]/);
    expect(animatedBlob).not.toMatch(/withRepeat\(\s*[\d.]/);
  });
});
