/**
 * First run: the initial goal, the decision about notifications, and the way
 * out of both.
 *
 * Every test here renders the screen over the in-memory storage from TASK-003
 * and the fake scheduler from TASK-008, per docs/testing-strategy.md, "Screen
 * tests": render with fake storage and a fake scheduler, and assert on what the
 * user would see and what was persisted. No test in this directory calls
 * AsyncStorage or prompts for a real permission — `storageInterface.test.ts`
 * and `notifications/noRealNotifications.test.ts` assert that of the sources as
 * well as of these tests.
 *
 * Closing and reopening the app is modelled the way the storage suite models
 * it: a second storage built over the store the first one wrote to. The process
 * is gone, the stored strings are not.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { DEFAULT_GOAL_ML } from '../../src/domain';
// The two pure modules are imported directly rather than through the barrel,
// which re-exports the device scheduler — the same arrangement the settings and
// today suites use.
import { createFakeReminderScheduler } from '../../src/notifications/fakeScheduler';
import { NotificationPermission } from '../../src/notifications/permission';
import {
  ALLOW_REMINDERS_LABEL,
  CONTINUE_LABEL,
  DECLINE_REMINDERS_LABEL,
  NOT_POSITIVE_MESSAGE,
  ONBOARDING_GOAL_INPUT_LABEL,
  ONBOARDING_TITLE,
  ONBOARDING_WRITE_FAILED_MESSAGE,
  OnboardingScreen,
  REMINDERS_STEP_HEADING,
  SKIP_LABEL,
} from '../../src/screens';
import {
  createInMemoryHydrationStorage,
  createInMemoryKeyValueStore,
  createNotificationPermissionStorage,
  createOnboardingStorage,
  createReminderSettingsStorage,
  GOAL_KEY,
  HydrationStorage,
  InMemoryKeyValueStore,
  OnboardingOutcome,
} from '../../src/storage';

/** Everything onboarding is handed, all over one store. */
function build(whenPrompted: NotificationPermission = 'granted') {
  const store = createInMemoryKeyValueStore();

  return {
    store,
    storage: createInMemoryHydrationStorage(store),
    onboarding: createOnboardingStorage(store),
    settings: createReminderSettingsStorage(store),
    permissions: createNotificationPermissionStorage(store),
    scheduler: createFakeReminderScheduler({ whenPrompted }),
  };
}

type Parts = ReturnType<typeof build>;

/** What the app reads on the next launch: a second storage over the same store. */
function reopen(store: InMemoryKeyValueStore) {
  return {
    storage: createInMemoryHydrationStorage(store),
    onboarding: createOnboardingStorage(store),
    settings: createReminderSettingsStorage(store),
    permissions: createNotificationPermissionStorage(store),
  };
}

interface Rendered {
  readonly finished: OnboardingOutcome[];
}

function open(parts: Parts, storage: HydrationStorage = parts.storage): Rendered {
  const finished: OnboardingOutcome[] = [];

  render(
    <OnboardingScreen
      storage={storage}
      onboarding={parts.onboarding}
      settings={parts.settings}
      permissions={parts.permissions}
      scheduler={parts.scheduler}
      onFinished={(outcome) => finished.push(outcome)}
    />,
  );

  return { finished };
}

const press = (name: string): void =>
  fireEvent.press(screen.getByRole('button', { name }));

const type = (text: string): void =>
  fireEvent.changeText(screen.getByLabelText(ONBOARDING_GOAL_INPUT_LABEL), text);

/** Types a goal and moves on to the reminders step. */
async function continueWith(goalMl: number): Promise<void> {
  type(String(goalMl));
  press(CONTINUE_LABEL);

  await screen.findByText(REMINDERS_STEP_HEADING);
}

describe('the goal step', () => {
  it('is what first run opens on', () => {
    const parts = build();

    open(parts);

    expect(screen.getByText(ONBOARDING_TITLE)).toBeOnTheScreen();
    expect(screen.getByLabelText(ONBOARDING_GOAL_INPUT_LABEL)).toHaveDisplayValue(
      String(DEFAULT_GOAL_ML),
    );
  });

  it('stores the goal that was typed', async () => {
    const parts = build();

    open(parts);
    await continueWith(2500);

    expect(await reopen(parts.store).storage.readGoal()).toEqual({ amountMl: 2500 });
  });

  it('rejects an impossible goal on screen, writes nothing, and stays put', async () => {
    const parts = build();

    open(parts);
    type('0');
    press(CONTINUE_LABEL);

    expect(await screen.findByText(NOT_POSITIVE_MESSAGE)).toBeOnTheScreen();
    expect(screen.queryByText(REMINDERS_STEP_HEADING)).toBeNull();
    expect(parts.store.snapshot()).toEqual({});
  });

  it('reports a goal that could not be stored rather than moving on', async () => {
    const parts = build();
    const failing: HydrationStorage = {
      ...parts.storage,
      writeGoal: () => Promise.reject(new Error('the disk is full')),
    };

    open(parts, failing);
    press(CONTINUE_LABEL);

    expect(await screen.findByText(ONBOARDING_WRITE_FAILED_MESSAGE)).toBeOnTheScreen();
    // Still on the goal step, and first run is not recorded as done.
    expect(screen.queryByText(REMINDERS_STEP_HEADING)).toBeNull();
    expect(await reopen(parts.store).onboarding.readOnboarding()).toBe('pending');
  });
});

describe('allowing reminders', () => {
  it('asks the platform once, and records that it was granted', async () => {
    const parts = build('granted');

    const { finished } = open(parts);
    await continueWith(2200);
    press(ALLOW_REMINDERS_LABEL);

    await waitFor(() => expect(finished).toEqual(['completed']));

    const next = reopen(parts.store);
    expect(parts.scheduler.prompts()).toBe(1);
    expect(await next.permissions.readNotificationPermission()).toBe('granted');
    expect((await next.settings.readReminderSettings()).enabled).toBe(true);
    expect(await next.onboarding.readOnboarding()).toBe('completed');
  });

  it('records a refusal and switches reminders off, leaving a usable app', async () => {
    const parts = build('denied');

    const { finished } = open(parts);
    await continueWith(2200);
    press(ALLOW_REMINDERS_LABEL);

    await waitFor(() => expect(finished).toEqual(['completed']));

    const next = reopen(parts.store);
    // Recorded so the user is not asked on every launch, and the goal they
    // typed is still theirs: a refusal costs reminders, not the app.
    expect(await next.permissions.readNotificationPermission()).toBe('denied');
    expect((await next.settings.readReminderSettings()).enabled).toBe(false);
    expect(await next.storage.readGoal()).toEqual({ amountMl: 2200 });
    expect(await next.onboarding.readOnboarding()).toBe('completed');
  });

  it('treats a prompt that throws as unanswered rather than as a refusal', async () => {
    const parts = build();
    const { finished } = open({
      ...parts,
      scheduler: {
        ...parts.scheduler,
        requestPermission: () => Promise.reject(new Error('no notification service')),
      } as Parts['scheduler'],
    });

    await continueWith(2000);
    press(ALLOW_REMINDERS_LABEL);

    await waitFor(() => expect(finished).toEqual(['completed']));

    const next = reopen(parts.store);
    // Nobody is recorded as having refused on the strength of a failed call.
    expect(await next.permissions.readNotificationPermission()).toBe('undetermined');
    expect(await next.onboarding.readOnboarding()).toBe('completed');
  });
});

describe('declining reminders', () => {
  it('switches them off without prompting the platform at all', async () => {
    const parts = build();

    const { finished } = open(parts);
    await continueWith(1800);
    press(DECLINE_REMINDERS_LABEL);

    await waitFor(() => expect(finished).toEqual(['completed']));

    const next = reopen(parts.store);
    expect(parts.scheduler.prompts()).toBe(0);
    expect((await next.settings.readReminderSettings()).enabled).toBe(false);
    // The operating system was never asked, so nothing is recorded about it.
    expect(await next.permissions.readNotificationPermission()).toBe('undetermined');
    expect(await next.storage.readGoal()).toEqual({ amountMl: 1800 });
    expect(await next.onboarding.readOnboarding()).toBe('completed');
  });
});

describe('skipping', () => {
  it('leaves the default goal, reminders off, and no prompt', async () => {
    const parts = build();

    const { finished } = open(parts);
    press(SKIP_LABEL);

    await waitFor(() => expect(finished).toEqual(['skipped']));

    const next = reopen(parts.store);
    expect(parts.scheduler.prompts()).toBe(0);
    // No goal was written; the documented default is what answers for it.
    expect(parts.store.snapshot()[GOAL_KEY]).toBeUndefined();
    expect(await next.storage.readGoal()).toEqual({ amountMl: DEFAULT_GOAL_ML });
    expect((await next.settings.readReminderSettings()).enabled).toBe(false);
    expect(await next.onboarding.readOnboarding()).toBe('skipped');
  });

  it('is offered on the reminders step too, keeping the goal already stored', async () => {
    const parts = build();

    const { finished } = open(parts);
    await continueWith(2400);
    press(SKIP_LABEL);

    await waitFor(() => expect(finished).toEqual(['skipped']));

    const next = reopen(parts.store);
    expect(parts.scheduler.prompts()).toBe(0);
    expect(await next.storage.readGoal()).toEqual({ amountMl: 2400 });
    expect((await next.settings.readReminderSettings()).enabled).toBe(false);
    expect(await next.onboarding.readOnboarding()).toBe('skipped');
  });
});

describe('storage that misbehaves', () => {
  it('still lets the user into the app when the record cannot be written', async () => {
    const parts = build();

    const { finished } = open({
      ...parts,
      onboarding: {
        ...parts.onboarding,
        writeOnboarding: () => Promise.reject(new Error('the disk is full')),
      },
    });
    press(SKIP_LABEL);

    // Onboarding may appear once more, which is a far smaller failure than a
    // user who cannot get past this screen at all.
    await waitFor(() => expect(finished).toEqual(['skipped']));
  });

  it('still lets the user into the app when reminders cannot be switched off', async () => {
    const parts = build();

    const { finished } = open({
      ...parts,
      settings: {
        ...parts.settings,
        writeReminderSettings: () => Promise.reject(new Error('the disk is full')),
      },
    });
    press(SKIP_LABEL);

    await waitFor(() => expect(finished).toEqual(['skipped']));
    expect(await reopen(parts.store).onboarding.readOnboarding()).toBe('skipped');
  });
});
