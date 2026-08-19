/**
 * Recording what the user answered about notifications.
 *
 * docs/functional-spec.md, "Reminders": the denial "is recorded so the user is
 * not asked on every launch". Recorded means it survives the app closing, so
 * that is what these assert — against the in-memory store, like every other
 * storage suite. No test here calls AsyncStorage.
 *
 * The reading side is asserted the way `records.test.ts` asserts its own: a
 * value that cannot be read yields the documented default rather than
 * throwing, and nobody is treated as having answered on the strength of it.
 */
import { createDay, createGoal } from '../../src/domain';
import { NotificationPermission } from '../../src/notifications/permission';
import {
  createHydrationStorage,
  createInMemoryKeyValueStore,
  createNotificationPermissionStorage,
  decodeNotificationPermission,
  encodeNotificationPermission,
  GOAL_KEY,
  InMemoryKeyValueStore,
  NOTIFICATION_PERMISSION_KEY,
} from '../../src/storage';

const STATES: NotificationPermission[] = ['undetermined', 'granted', 'denied'];

function open(store: InMemoryKeyValueStore = createInMemoryKeyValueStore()) {
  return { store, permissions: createNotificationPermissionStorage(store) };
}

describe('the recorded answer', () => {
  it.each(STATES)('survives being written and read back as %s', async (state) => {
    const { store, permissions } = open();

    await permissions.writeNotificationPermission(state);

    // A second storage over the same store is the app being opened again.
    expect(await open(store).permissions.readNotificationPermission()).toBe(state);
  });

  it('is "undetermined" when nothing has ever been recorded', async () => {
    expect(await open().permissions.readNotificationPermission()).toBe('undetermined');
  });

  it('replaces the previous answer rather than adding to it', async () => {
    const { store, permissions } = open();

    await permissions.writeNotificationPermission('granted');
    await permissions.writeNotificationPermission('denied');

    expect(await permissions.readNotificationPermission()).toBe('denied');
    expect(Object.keys(store.snapshot())).toEqual([NOTIFICATION_PERMISSION_KEY]);
  });

  it('is stored under its own key, leaving the goal and the days alone', async () => {
    const { store, permissions } = open();
    const hydration = createHydrationStorage(store);
    await hydration.writeGoal(createGoal(2500));
    await hydration.writeDay(createDay('2026-08-18', createGoal(2500)));
    const before = store.snapshot();

    await permissions.writeNotificationPermission('denied');

    const after = store.snapshot();
    expect(after[GOAL_KEY]).toBe(before[GOAL_KEY]);
    expect(after['sip:day:2026-08-18']).toBe(before['sip:day:2026-08-18']);
    expect(after[NOTIFICATION_PERMISSION_KEY]).toBeDefined();
  });

  it('refuses to record something that is not one of the three states', async () => {
    const { store, permissions } = open();

    await expect(
      permissions.writeNotificationPermission('maybe' as NotificationPermission),
    ).rejects.toThrow(TypeError);
    expect(store.snapshot()).toEqual({});
  });
});

describe('an unreadable record', () => {
  it.each([
    ['nothing stored', null],
    ['an empty value', ''],
    ['blank space', '   '],
    ['not JSON at all', '{denied'],
    ['JSON of the wrong shape', '["denied"]'],
    ['an object without the field', '{"status":"denied"}'],
    ['a state this app does not know', '{"permission":"maybe"}'],
    ['a null field', '{"permission":null}'],
  ])('reads back as undetermined: %s', (_case, raw) => {
    expect(decodeNotificationPermission(raw)).toBe('undetermined');
  });

  it('is read back as undetermined through the storage as well', async () => {
    const { store, permissions } = open();
    // The kind of value a device accumulates: truncated, or written by hand.
    store.seed(NOTIFICATION_PERMISSION_KEY, '{"permis');

    // Nobody is treated as having refused — or granted — on the strength of it.
    expect(await permissions.readNotificationPermission()).toBe('undetermined');
  });
});

describe('the encoding', () => {
  it.each(STATES)('round-trips %s', (state) => {
    expect(decodeNotificationPermission(encodeNotificationPermission(state))).toBe(state);
  });

  it('refuses to encode anything else', () => {
    expect(() => encodeNotificationPermission('later' as NotificationPermission)).toThrow(
      TypeError,
    );
  });
});
