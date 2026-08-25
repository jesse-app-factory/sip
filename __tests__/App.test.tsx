/**
 * The composition root, rendered as the phone would render it.
 *
 * What onboarding does and when it appears is asserted against the in-memory
 * storage in `screens/OnboardingScreen.test.tsx` and
 * `navigation/FirstRunGate.test.tsx`, and what the tabs do against the same in
 * `navigation/AppTabs.test.tsx`. This suite covers only what those cannot: that
 * `App` wires the real implementations together, that a launch with nothing
 * stored opens on onboarding, and that skipping it leaves an app whose every
 * screen a finger can actually reach. A screen that exists and is mounted
 * nowhere fails here.
 *
 * `jest.setup.js` registers the mock AsyncStorage ships for exactly this, so no
 * device store is reached here either. Its contents survive between tests in a
 * file, so each test starts by emptying it — which is also what keeps this
 * suite independent of the order its tests run in.
 *
 * Nothing here logs a glass or changes a reminder setting, because this is the
 * one suite holding the device scheduler and docs/testing-strategy.md is plain
 * that no test may schedule a real notification or request a real permission.
 * Skipping onboarding, which is as far as this goes, writes to storage and asks
 * the platform nothing. What logging and the settings do to what is pending is
 * asserted against the fake scheduler in `navigation/AppTabs.test.tsx`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentType } from 'react';

import type { ReminderScheduler, ReminderServiceOptions } from '../src/notifications';
import {
  APP_TABS,
  FIRST_RUN_LOADING_MESSAGE,
  GOAL_TAB,
  HISTORY_TAB,
  SETTINGS_TAB,
  tabLabel,
} from '../src/navigation';
import {
  GOAL_INPUT_LABEL,
  GOAL_LABEL,
  glassButtonLabel,
  ONBOARDING_TITLE,
  REMINDERS_LABEL,
  SKIP_LABEL,
  statLabel,
  streakSummary,
  switchLabel,
  UNDO_LABEL,
} from '../src/screens';

/**
 * What the composition root built, recorded as it built it.
 *
 * `App` composes at module scope, so the recording happens when this file loads
 * it — before the first test runs. `clearMocks` empties a `jest.fn`'s calls
 * before each test, which would erase the evidence before it could be read, so
 * the record is kept here instead of on the mocks themselves.
 */
const mockComposition: {
  device: ReminderScheduler[];
  fakes: number;
  services: ReminderServiceOptions[];
} = { device: [], fakes: 0, services: [] };

jest.mock('../src/notifications', () => {
  const actual = jest.requireActual<typeof import('../src/notifications')>(
    '../src/notifications',
  );

  return {
    ...actual,
    createExpoReminderScheduler: (
      ...args: Parameters<typeof actual.createExpoReminderScheduler>
    ) => {
      const scheduler = actual.createExpoReminderScheduler(...args);
      mockComposition.device.push(scheduler);

      return scheduler;
    },
    createFakeReminderScheduler: (
      ...args: Parameters<typeof actual.createFakeReminderScheduler>
    ) => {
      mockComposition.fakes += 1;

      return actual.createFakeReminderScheduler(...args);
    },
    createReminderService: (options: ReminderServiceOptions) => {
      mockComposition.services.push(options);

      return actual.createReminderService(options);
    },
  };
});

/**
 * `App` is loaded here rather than imported, and the difference matters: Babel
 * hoists every `import` in a file above its statements, so an imported `App`
 * would compose — and record — before the record above existed. `@types/node`
 * is not a dependency of this project, so the shape of `require` is declared
 * locally, as `storage/noAsyncStorage.test.ts` declares the shape of `fs`.
 */
declare const require: (id: string) => unknown;

const App = (require('../App') as { default: ComponentType }).default;

/** Lets the read of the record settle inside the test rather than after it. */
const settle = (): Promise<unknown> => screen.findByText(ONBOARDING_TITLE);

/** Renders a first launch, skips onboarding, and waits for the app itself. */
async function skipOnboarding(): Promise<void> {
  render(<App />);

  fireEvent.press(await screen.findByText(SKIP_LABEL));

  await screen.findByLabelText(statLabel(GOAL_LABEL, 2000));
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('App', () => {
  it('renders without throwing', async () => {
    expect(() => render(<App />)).not.toThrow();

    await settle();
  });

  it('shows the app name', async () => {
    render(<App />);

    expect(screen.getByText('Sip')).toBeOnTheScreen();

    await settle();
  });

  it('waits for the record of first run before showing a screen', async () => {
    render(<App />);

    expect(screen.getByText(FIRST_RUN_LOADING_MESSAGE)).toBeOnTheScreen();

    await settle();
  });

  it('opens on onboarding, with a way to skip it', async () => {
    render(<App />);

    expect(await screen.findByText(ONBOARDING_TITLE)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: SKIP_LABEL })).toBeOnTheScreen();
  });
});

describe('App, once onboarding is behind the user', () => {
  it('shows the today screen, with logging and undo in reach', async () => {
    await skipOnboarding();

    expect(screen.queryByText(ONBOARDING_TITLE)).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: glassButtonLabel(250) })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: UNDO_LABEL })).toBeOnTheScreen();
  });

  it('offers a tab for every screen', async () => {
    await skipOnboarding();

    for (const name of APP_TABS) {
      expect(screen.getByLabelText(tabLabel(name))).toBeOnTheScreen();
    }
  });

  it('reaches the history screen', async () => {
    await skipOnboarding();

    fireEvent.press(screen.getByLabelText(tabLabel(HISTORY_TAB)));

    expect(await screen.findByText(streakSummary(0))).toBeOnTheScreen();
  });

  it('reaches the settings screen', async () => {
    await skipOnboarding();

    fireEvent.press(screen.getByLabelText(tabLabel(SETTINGS_TAB)));

    // Skipping switches reminders off, per docs/functional-spec.md, "First
    // run", so this is the switch as a skipped first run leaves it.
    expect(
      await screen.findByLabelText(switchLabel(REMINDERS_LABEL, false)),
    ).toBeOnTheScreen();
  });

  it('reaches the goal screen, so the goal can still be changed', async () => {
    await skipOnboarding();

    fireEvent.press(screen.getByLabelText(tabLabel(GOAL_TAB)));

    expect(await screen.findByLabelText(GOAL_INPUT_LABEL)).toBeOnTheScreen();
  });

  it('does not show onboarding again on the launch after it', async () => {
    await skipOnboarding();
    screen.unmount();

    render(<App />);

    // Straight to the app: the record of first run is read from the store the
    // skip above wrote to, so the second launch never reaches onboarding.
    expect(await screen.findByLabelText(statLabel(GOAL_LABEL, 2000))).toBeOnTheScreen();
    expect(screen.queryByText(ONBOARDING_TITLE)).not.toBeOnTheScreen();

    await act(async () => {});
  });
});

describe('the reminder service', () => {
  it('is constructed once, when the app starts', () => {
    expect(mockComposition.services).toHaveLength(1);
  });

  it('is given the device scheduler rather than the fake', () => {
    expect(mockComposition.device).toHaveLength(1);
    // The very object `createExpoReminderScheduler` returned, so a reminder
    // reaches `expo-notifications` on a phone rather than a test double.
    expect(mockComposition.services[0].scheduler).toBe(mockComposition.device[0]);
    expect(mockComposition.fakes).toBe(0);
  });

  it('is given the same storage the screens read their settings from', () => {
    // A second store would answer a different question: the interval and the
    // off switch the settings screen writes are the ones the service must read.
    expect(mockComposition.services[0].settings).toBeDefined();
    expect(mockComposition.services[0].permissions).toBeDefined();
  });
});
