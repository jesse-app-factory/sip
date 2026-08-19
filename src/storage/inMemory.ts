/**
 * The in-memory implementation: a `Map` behind the same interface as the
 * device store.
 *
 * Every test in the project uses this one. CI has no device, so a test
 * reaching AsyncStorage could not pass there — see docs/testing-strategy.md,
 * "The constraint that shapes everything".
 *
 * It is not only for tests, though: because it holds the same encoded strings
 * the device would, handing the same store to a second `HydrationStorage` is
 * exactly what relaunching the app does, which is how "survives closing and
 * reopening" becomes something a test can assert.
 */
import { createHydrationStorage, HydrationStorage } from './hydrationStorage';
import { KeyValueStore } from './keyValueStore';

export interface InMemoryKeyValueStore extends KeyValueStore {
  /**
   * Writes a raw string without going through the encoder, so a test can put
   * back the truncated, hand-edited or foreign values a real device
   * accumulates.
   */
  seed(key: string, value: string): void;

  /** Everything stored, as a plain object, for asserting on the layout. */
  snapshot(): Record<string, string>;
}

/**
 * A store starting empty. Each call returns its own, so no test can leak state
 * into another.
 */
export function createInMemoryKeyValueStore(): InMemoryKeyValueStore {
  const values = new Map<string, string>();

  return {
    async read(key: string): Promise<string | null> {
      return values.get(key) ?? null;
    },

    async write(key: string, value: string): Promise<void> {
      values.set(key, value);
    },

    seed(key: string, value: string): void {
      values.set(key, value);
    },

    snapshot(): Record<string, string> {
      return Object.fromEntries(values);
    },
  };
}

/**
 * Storage backed by memory. Pass an existing store to keep what it already
 * holds — the app being reopened over data written before it closed.
 */
export function createInMemoryHydrationStorage(
  store: InMemoryKeyValueStore = createInMemoryKeyValueStore(),
): HydrationStorage {
  return createHydrationStorage(store);
}
