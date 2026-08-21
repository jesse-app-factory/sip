/**
 * Recording that first run is behind the user.
 *
 * docs/functional-spec.md, "First run": onboarding "appears once. Completing it
 * or skipping it both prevent it appearing again." Appearing once means the
 * record survives the app closing, so that is what these assert — against the
 * in-memory store, like every other storage suite. No test here calls
 * AsyncStorage.
 *
 * The reading side is asserted the way `notificationPermission.test.ts` asserts
 * its own: a value that cannot be read yields the documented default rather
 * than throwing.
 */
import { createDay, createGoal } from '../../src/domain';
import {
  createHydrationStorage,
  createInMemoryKeyValueStore,
  createOnboardingStorage,
  decodeOnboarding,
  DEFAULT_ONBOARDING_STATE,
  encodeOnboarding,
  GOAL_KEY,
  InMemoryKeyValueStore,
  isOnboardingOutcome,
  ONBOARDING_KEY,
  ONBOARDING_OUTCOMES,
  OnboardingOutcome,
} from '../../src/storage';

function open(store: InMemoryKeyValueStore = createInMemoryKeyValueStore()) {
  return { store, onboarding: createOnboardingStorage(store) };
}

describe('the record of first run', () => {
  it.each(ONBOARDING_OUTCOMES)('survives being written and read back as %s', async (outcome) => {
    const { store, onboarding } = open();

    await onboarding.writeOnboarding(outcome);

    // A second storage over the same store is the app being opened again.
    expect(await open(store).onboarding.readOnboarding()).toBe(outcome);
  });

  it('is "pending" when nothing has ever been recorded', async () => {
    expect(await open().onboarding.readOnboarding()).toBe(DEFAULT_ONBOARDING_STATE);
    expect(DEFAULT_ONBOARDING_STATE).toBe('pending');
  });

  it('is stored under its own key, leaving the goal and the days alone', async () => {
    const { store, onboarding } = open();
    const hydration = createHydrationStorage(store);
    await hydration.writeGoal(createGoal(2500));
    await hydration.writeDay(createDay('2026-08-18', createGoal(2500)));
    const before = store.snapshot();

    await onboarding.writeOnboarding('completed');

    const after = store.snapshot();
    expect(after[GOAL_KEY]).toBe(before[GOAL_KEY]);
    expect(after['sip:day:2026-08-18']).toBe(before['sip:day:2026-08-18']);
    expect(after[ONBOARDING_KEY]).toBeDefined();
  });

  it('replaces the previous record rather than adding to it', async () => {
    const { store, onboarding } = open();

    await onboarding.writeOnboarding('skipped');
    await onboarding.writeOnboarding('completed');

    expect(await onboarding.readOnboarding()).toBe('completed');
    expect(Object.keys(store.snapshot())).toEqual([ONBOARDING_KEY]);
  });

  it('refuses to record anything that is not an outcome', async () => {
    const { store, onboarding } = open();

    await expect(
      onboarding.writeOnboarding('pending' as OnboardingOutcome),
    ).rejects.toThrow(TypeError);
    // "Not finished yet" is the absence of a record, not a record.
    expect(store.snapshot()).toEqual({});
  });
});

describe('an unreadable record', () => {
  it.each([
    ['nothing stored', null],
    ['an empty value', ''],
    ['blank space', '   '],
    ['not JSON at all', '{completed'],
    ['JSON of the wrong shape', '["completed"]'],
    ['an object without the field', '{"state":"completed"}'],
    ['an outcome this app does not know', '{"outcome":"postponed"}'],
    ['a null field', '{"outcome":null}'],
  ])('reads back as pending: %s', (_case, raw) => {
    expect(decodeOnboarding(raw)).toBe('pending');
  });

  it('is read back as pending through the storage as well', async () => {
    const { store, onboarding } = open();
    // The kind of value a device accumulates: truncated, or written by hand.
    store.seed(ONBOARDING_KEY, '{"outc');

    // Onboarding appears once more, and can be skipped: an unreadable record
    // cannot lock anyone out of the app.
    expect(await onboarding.readOnboarding()).toBe('pending');
  });
});

describe('the encoding', () => {
  it.each(ONBOARDING_OUTCOMES)('round-trips %s', (outcome) => {
    expect(decodeOnboarding(encodeOnboarding(outcome))).toBe(outcome);
  });

  it('refuses to encode anything else', () => {
    expect(() => encodeOnboarding('later' as OnboardingOutcome)).toThrow(TypeError);
  });

  it.each([
    ['completed', true],
    ['skipped', true],
    ['pending', false],
    ['', false],
    [null, false],
    [7, false],
  ])('recognises %s as an outcome: %s', (value, expected) => {
    expect(isOnboardingOutcome(value)).toBe(expected);
  });
});
