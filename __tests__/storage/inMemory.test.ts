/**
 * The in-memory store itself.
 *
 * It stands in for the device in every other test in the project, so its own
 * behaviour has to be right: values come back as they went in, a key that was
 * never written reads as absent, and two stores never see each other's data.
 * A fake that leaked between tests would make the suite depend on execution
 * order, which docs/testing-strategy.md forbids.
 */
import { createGoal } from '../../src/domain';
import {
  createInMemoryHydrationStorage,
  createInMemoryKeyValueStore,
  GOAL_KEY,
} from '../../src/storage';

describe('the in-memory store', () => {
  it('reads back what was written', async () => {
    const store = createInMemoryKeyValueStore();

    await store.write('sip:example', 'a value');

    expect(await store.read('sip:example')).toBe('a value');
  });

  it('reads a key that was never written as absent', async () => {
    expect(await createInMemoryKeyValueStore().read('sip:example')).toBeNull();
  });

  it('replaces a value rather than keeping both', async () => {
    const store = createInMemoryKeyValueStore();

    await store.write('sip:example', 'first');
    await store.write('sip:example', 'second');

    expect(await store.read('sip:example')).toBe('second');
    expect(store.snapshot()).toEqual({ 'sip:example': 'second' });
  });

  it('starts empty, and each store is its own', async () => {
    const one = createInMemoryKeyValueStore();
    const two = createInMemoryKeyValueStore();

    expect(one.snapshot()).toEqual({});

    await createInMemoryHydrationStorage(one).writeGoal(createGoal(2500));

    expect(await two.read(GOAL_KEY)).toBeNull();
    expect(two.snapshot()).toEqual({});
  });

  it('gives a snapshot that cannot be used to change the store', async () => {
    const store = createInMemoryKeyValueStore();
    await store.write('sip:example', 'a value');

    const snapshot = store.snapshot();
    snapshot['sip:example'] = 'tampered';
    snapshot['sip:other'] = 'added';

    expect(await store.read('sip:example')).toBe('a value');
    expect(await store.read('sip:other')).toBeNull();
  });

  it('seeds a raw value the encoder would never have produced', async () => {
    const store = createInMemoryKeyValueStore();

    store.seed(GOAL_KEY, 'not JSON');

    expect(await store.read(GOAL_KEY)).toBe('not JSON');
  });
});
