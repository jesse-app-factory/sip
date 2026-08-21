/**
 * The hydration domain: the rules of the app as pure functions over plain
 * values. Nothing here imports React, React Native, storage or any platform
 * module, and nothing reads the clock — see docs/architecture.md.
 *
 * Every layer above reads its behaviour from these functions rather than
 * reimplementing the arithmetic.
 */
export type { Goal } from './goal';
export type { Entry } from './entry';
export type { IsoTimestamp, LocalDate } from './time';
export type { Day } from './day';
export type { HistoryDay } from './history';

export { assertMillilitres } from './millilitres';
export { assertGoal, createGoal, defaultGoal, DEFAULT_GOAL_ML } from './goal';
export { assertEntry, compareEntries, createEntry } from './entry';
export {
  assertLocalDate,
  shiftLocalDate,
  toInstant,
  toIsoTimestamp,
  toLocalDate,
} from './time';
export {
  buildHistory,
  currentStreak,
  HISTORY_DAYS,
  isDayMet,
  isStreakOpenEnded,
  recentDates,
  toHistoryDay,
} from './history';
export {
  addEntry,
  createDay,
  isGoalMet,
  lastEntry,
  progress,
  remainingMl,
  timeSinceLastEntry,
  totalMl,
  undoLastEntry,
  withGoal,
} from './day';
