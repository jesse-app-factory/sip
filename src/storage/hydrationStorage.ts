/**
 * What the rest of the app persists: the goal, and one record per day.
 *
 * This is the interface screens depend on. It speaks in domain values rather
 * than strings, and every implementation of it is `createHydrationStorage`
 * over some `KeyValueStore` — the real one over AsyncStorage, the fake one
 * over a `Map`. Sharing the encoding between them is what makes a test against
 * the in-memory store evidence about the device: only the two-method adapter
 * differs.
 */
import { Day, Goal, LocalDate } from '../domain';
import { dayKey, GOAL_KEY } from './keys';
import { KeyValueStore } from './keyValueStore';
import { decodeDay, decodeGoal, encodeDay, encodeGoal } from './records';

export interface HydrationStorage {
  /**
   * The stored goal, or the default goal when nothing readable is stored — see
   * `records.ts` for the documented defaults. Never throws.
   */
  readGoal(): Promise<Goal>;

  /**
   * Replaces the stored goal. Throws `TypeError` for an invalid goal, and
   * resolves once it is stored.
   *
   * Days already written keep the goal they were written with: this key holds
   * what is intended from now on, not what any past day was judged against.
   */
  writeGoal(goal: Goal): Promise<void>;

  /**
   * The day stored under that local date, or `null` when nothing readable is
   * stored for it. Never throws for a stored value; throws `TypeError` for a
   * date that is not `YYYY-MM-DD`.
   */
  readDay(date: LocalDate): Promise<Day | null>;

  /**
   * The days under those dates, in the order asked for, with `null` for each
   * date holding nothing readable. History asks for seven dates at once, and a
   * missing day is a fact it needs rather than an error.
   */
  readDays(dates: readonly LocalDate[]): Promise<(Day | null)[]>;

  /**
   * Writes a day under its own date key, leaving every other day untouched.
   * Throws `TypeError` for an invalid day, and resolves once it is stored.
   */
  writeDay(day: Day): Promise<void>;
}

/**
 * Builds the storage over any key-value store. The store is the only thing
 * that differs between the device and a test.
 */
export function createHydrationStorage(store: KeyValueStore): HydrationStorage {
  async function readDay(date: LocalDate): Promise<Day | null> {
    return decodeDay(date, await store.read(dayKey(date)));
  }

  return {
    async readGoal(): Promise<Goal> {
      return decodeGoal(await store.read(GOAL_KEY));
    },

    async writeGoal(goal: Goal): Promise<void> {
      // Encoded before the write so an invalid goal throws instead of landing
      // in storage half-formed.
      await store.write(GOAL_KEY, encodeGoal(goal));
    },

    readDay,

    async readDays(dates: readonly LocalDate[]): Promise<(Day | null)[]> {
      return Promise.all(dates.map(readDay));
    },

    async writeDay(day: Day): Promise<void> {
      await store.write(dayKey(day.date), encodeDay(day));
    },
  };
}
