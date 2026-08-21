/**
 * Onboarding appears on first launch and never again.
 *
 * docs/functional-spec.md, "First run": "Onboarding appears once. Completing it
 * or skipping it both prevent it appearing again."
 *
 * A launch is modelled the way every other suite models one: a fresh render
 * over storage built on a store that survived the last render, per
 * docs/testing-strategy.md. The process is gone between them; the stored
 * strings are not — which is the only way "reopening the app" can be asserted
 * without a device.
 *
 * Nothing here calls AsyncStorage or prompts for a real permission: storage is
 * the in-memory implementation and the scheduler is the fake.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { DEFAULT_GOAL_ML } from '../../src/domain';
import { FIRST_RUN_LOADING_MESSAGE, FirstRunGate } from '../../src/navigation';
import { createFakeReminderScheduler } from '../../src/notifications/fakeScheduler';
import {
  ALLOW_REMINDERS_LABEL,
  CONTINUE_LABEL,
  ONBOARDING_GOAL_INPUT_LABEL,
  ONBOARDING_TITLE,
  REMINDERS_STEP_HEADING,
  SKIP_LABEL,
} from '../../src/screens';
import {
  createInMemoryHydrationStorage,
  createInMemoryKeyValueStore,
  createNotificationPermissionStorage,
  createOnboardingStorage,
  createReminderSettingsStorage,
  InMemoryKeyValueStore,
  OnboardingStorage,
  OnboardingState,
} from '../../src/storage';

/** What stands in for the app behind the gate. */
const APP = 'The app itself';

/**
 * One launch: the app process starting over whatever is already on the device.
 * A fresh scheduler each time, so a prompt counted here was made this launch.
 */
function launch(
  store: InMemoryKeyValueStore,
  onboarding: OnboardingStorage = createOnboardingStorage(store),
) {
  const scheduler = createFakeReminderScheduler();

  render(
    <FirstRunGate
      onboarding={onboarding}
      storage={createInMemoryHydrationStorage(store)}
      settings={createReminderSettingsStorage(store)}
      permissions={createNotificationPermissionStorage(store)}
      scheduler={scheduler}
    >
      <Text>{APP}</Text>
    </FirstRunGate>,
  );

  return { scheduler };
}

const press = (name: string): void =>
  fireEvent.press(screen.getByRole('button', { name }));

/** Ends the launch, as closing the app does. */
function close(): void {
  screen.unmount();
}

async function storedOutcome(store: InMemoryKeyValueStore): Promise<OnboardingState> {
  return createOnboardingStorage(store).readOnboarding();
}

describe('the first launch', () => {
  it('shows onboarding rather than the app', async () => {
    launch(createInMemoryKeyValueStore());

    expect(await screen.findByText(ONBOARDING_TITLE)).toBeOnTheScreen();
    expect(screen.queryByText(APP)).toBeNull();
  });

  it('reads the record before showing anything, so the app never flashes past', async () => {
    launch(createInMemoryKeyValueStore());

    // The very first frame, before the store has answered.
    expect(screen.getByText(FIRST_RUN_LOADING_MESSAGE)).toBeOnTheScreen();
    expect(screen.queryByText(APP)).toBeNull();
    expect(screen.queryByText(ONBOARDING_TITLE)).toBeNull();

    // Awaited so the read settles inside the test rather than after it.
    await screen.findByText(ONBOARDING_TITLE);
  });
});

describe('completing onboarding', () => {
  it('records it, and opens the app on every launch afterwards', async () => {
    const store = createInMemoryKeyValueStore();
    const first = launch(store);
    await screen.findByText(ONBOARDING_TITLE);

    fireEvent.changeText(screen.getByLabelText(ONBOARDING_GOAL_INPUT_LABEL), '2600');
    press(CONTINUE_LABEL);
    await screen.findByText(REMINDERS_STEP_HEADING);
    press(ALLOW_REMINDERS_LABEL);

    // The app, without a relaunch: onboarding is behind the user the moment it
    // ends.
    expect(await screen.findByText(APP)).toBeOnTheScreen();
    expect(first.scheduler.prompts()).toBe(1);
    expect(await storedOutcome(store)).toBe('completed');

    close();

    // The app is opened again, over what the first launch wrote.
    const second = launch(store);
    expect(await screen.findByText(APP)).toBeOnTheScreen();
    expect(screen.queryByText(ONBOARDING_TITLE)).toBeNull();
    // Not asked again on this launch, or on any launch after it.
    expect(second.scheduler.prompts()).toBe(0);

    close();

    launch(store);
    expect(await screen.findByText(APP)).toBeOnTheScreen();
    expect(screen.queryByText(ONBOARDING_TITLE)).toBeNull();
    expect(await createInMemoryHydrationStorage(store).readGoal()).toEqual({
      amountMl: 2600,
    });
  });
});

describe('skipping onboarding', () => {
  it('records it, and opens a working app on every launch afterwards', async () => {
    const store = createInMemoryKeyValueStore();
    const first = launch(store);
    await screen.findByText(ONBOARDING_TITLE);

    press(SKIP_LABEL);

    expect(await screen.findByText(APP)).toBeOnTheScreen();
    expect(first.scheduler.prompts()).toBe(0);
    expect(await storedOutcome(store)).toBe('skipped');

    close();

    const second = launch(store);
    expect(await screen.findByText(APP)).toBeOnTheScreen();
    expect(screen.queryByText(ONBOARDING_TITLE)).toBeNull();
    expect(second.scheduler.prompts()).toBe(0);

    // The documented defaults a skipped setup leaves behind: 2000 ml a day, and
    // reminders off, per docs/functional-spec.md, "First run".
    expect(await createInMemoryHydrationStorage(store).readGoal()).toEqual({
      amountMl: DEFAULT_GOAL_ML,
    });
    expect(
      (await createReminderSettingsStorage(store).readReminderSettings()).enabled,
    ).toBe(false);
  });
});

describe('a launch that cannot read the record', () => {
  it('shows onboarding rather than nothing at all', async () => {
    const store = createInMemoryKeyValueStore();
    const failing: OnboardingStorage = {
      ...createOnboardingStorage(store),
      readOnboarding: () => Promise.reject(new Error('the store is unavailable')),
    };

    launch(store, failing);

    // A gate that never opens is a blank app; onboarding can always be skipped.
    expect(await screen.findByText(ONBOARDING_TITLE)).toBeOnTheScreen();

    press(SKIP_LABEL);
    await waitFor(() => expect(screen.getByText(APP)).toBeOnTheScreen());
  });
});
