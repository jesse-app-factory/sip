/**
 * The device implementation: AsyncStorage behind the same interface as the
 * fake.
 *
 * This is the only file in the app that imports AsyncStorage, and it is
 * deliberately the thinnest thing that could work — two methods, no logic,
 * nothing to get wrong. Everything worth being sure about lives above it in
 * `records.ts` and `hydrationStorage.ts`, where it is tested against the
 * in-memory store, per docs/architecture.md, "Why interfaces for storage and
 * notifications".
 *
 * Nothing here reaches the network. AsyncStorage writes to the device and
 * nowhere else, which is the whole of the storage story — see
 * docs/functional-spec.md, "Data".
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createHydrationStorage, HydrationStorage } from './hydrationStorage';
import { KeyValueStore } from './keyValueStore';

/** The two methods of AsyncStorage this app uses, and nothing else. */
interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/**
 * Adapts AsyncStorage to the store interface. The parameter exists so the
 * adapter can be handed a stand-in; the app calls it with no argument.
 */
export function createAsyncStorageKeyValueStore(
  asyncStorage: AsyncStorageLike = AsyncStorage,
): KeyValueStore {
  return {
    read(key: string): Promise<string | null> {
      return asyncStorage.getItem(key);
    },

    write(key: string, value: string): Promise<void> {
      return asyncStorage.setItem(key, value);
    },
  };
}

/** Storage as the running app uses it: on the device, and only on the device. */
export function createAsyncStorageHydrationStorage(): HydrationStorage {
  return createHydrationStorage(createAsyncStorageKeyValueStore());
}
