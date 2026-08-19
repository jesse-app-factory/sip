/**
 * The daily goal: a whole number of millilitres greater than zero.
 *
 * A goal is a value rather than a bare number so that it cannot be confused
 * with a total or an entry amount, and so that every goal in the app has been
 * through one validation.
 */
import { assertMillilitres } from './millilitres';

export interface Goal {
  readonly amountMl: number;
}

/**
 * The goal a user who skips onboarding gets, per docs/functional-spec.md,
 * "First run".
 */
export const DEFAULT_GOAL_ML = 2000;

/**
 * Creates a goal, throwing `TypeError` for zero, a negative number, a
 * non-integer or a non-number.
 */
export function createGoal(amountMl: number): Goal {
  assertMillilitres(amountMl, 'A goal');

  return { amountMl };
}

/** The default goal, as its own value so callers never share one instance. */
export function defaultGoal(): Goal {
  return createGoal(DEFAULT_GOAL_ML);
}

/** Narrows an unknown value to a `Goal`, throwing `TypeError` if it is not. */
export function assertGoal(value: unknown): asserts value is Goal {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`A goal must be an object, received ${typeof value}`);
  }

  assertMillilitres((value as { amountMl?: unknown }).amountMl, 'A goal');
}
