/**
 * The goal is a whole number of millilitres greater than zero, and anything
 * else is a `TypeError` rather than an invalid goal that later arithmetic has
 * to defend against.
 */
import {
  assertGoal,
  createGoal,
  defaultGoal,
  DEFAULT_GOAL_ML,
} from '../../src/domain';

describe('createGoal', () => {
  it('creates a goal as an amount in millilitres', () => {
    expect(createGoal(2000)).toEqual({ amountMl: 2000 });
    expect(createGoal(1)).toEqual({ amountMl: 1 });
  });

  it('throws a TypeError for zero', () => {
    expect(() => createGoal(0)).toThrow(TypeError);
  });

  it('throws a TypeError for a negative number', () => {
    expect(() => createGoal(-1)).toThrow(TypeError);
    expect(() => createGoal(-2000)).toThrow(TypeError);
  });

  it('throws a TypeError for a non-integer', () => {
    expect(() => createGoal(1500.5)).toThrow(TypeError);
    expect(() => createGoal(0.1)).toThrow(TypeError);
  });

  it('throws a TypeError for a non-number', () => {
    const invalid: unknown[] = [
      '2000',
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      {},
      [],
      true,
    ];

    for (const value of invalid) {
      expect(() => createGoal(value as number)).toThrow(TypeError);
    }
  });

  it('names the amount in the message rather than failing silently', () => {
    expect(() => createGoal(0)).toThrow(/millilitres/);
  });
});

describe('defaultGoal', () => {
  it('is the 2000 ml documented for a skipped onboarding', () => {
    expect(DEFAULT_GOAL_ML).toBe(2000);
    expect(defaultGoal()).toEqual({ amountMl: 2000 });
  });

  it('returns a fresh value each time rather than a shared instance', () => {
    expect(defaultGoal()).not.toBe(defaultGoal());
  });
});

describe('assertGoal', () => {
  it('accepts a created goal', () => {
    expect(() => assertGoal(createGoal(500))).not.toThrow();
  });

  it('rejects anything that is not a goal', () => {
    expect(() => assertGoal(null)).toThrow(TypeError);
    expect(() => assertGoal(2000)).toThrow(TypeError);
    expect(() => assertGoal({})).toThrow(TypeError);
    expect(() => assertGoal({ amountMl: 0 })).toThrow(TypeError);
  });
});
