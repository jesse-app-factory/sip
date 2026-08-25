/**
 * The tabs: that each of the four screens is mounted and reachable.
 *
 * What each screen does is asserted in `screens/`, against the in-memory
 * storage and the fake scheduler. This suite asserts only what those cannot: a
 * screen that exists, is covered by tests and is wired to no tab is invisible
 * on a phone, and that is the failure this file exists to catch.
 *
 * Everything below runs over one in-memory store and one fake scheduler, so no
 * device store is read and no notification is scheduled, per
 * docs/testing-strategy.md. The clock is injected, so which day is "today" is
 * decided here rather than by when the suite runs.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createGoal, toLocalDate } from '../../src/domain';
import {
  APP_TABS,
  AppTabName,
  AppTabs,
  GOAL_TAB,
  HISTORY_TAB,
  SETTINGS_TAB,
  tabLabel,
  TODAY_TAB,
} from '../../src/navigation';
import { createFakeReminderScheduler } from '../../src/notifications/fakeScheduler';
import { createReminderService } from '../../src/notifications/reminderService';
import {
  GOAL_INPUT_LABEL,
  GOAL_LABEL,
  glassButtonLabel,
  REMINDERS_LABEL,
  statLabel,
  streakSummary,
  switchLabel,
  TOTAL_LABEL,
  UNDO_LABEL,
} from '../../src/screens';
import {
  createInMemoryHydrationStorage,
  createInMemoryKeyValueStore,
  createNotificationPermissionStorage,
  createReminderSettingsStorage,
  InMemoryKeyValueStore,
} from '../../src/storage';

/** A local moment, so the local day boundary means what it says. */
const NOW = new Date(2026, 7, 18, 10, 0, 0, 0);
const TODAY = toLocalDate(NOW);

const now = (): Date => NOW;

/** The app as it is composed for a test: one store, one scheduler, one service. */
function build(store: InMemoryKeyValueStore = createInMemoryKeyValueStore()) {
  const scheduler = createFakeReminderScheduler({ permission: 'granted' });
  const permissions = createNotificationPermissionStorage(store);
  const settings = createReminderSettingsStorage(store);

  return {
    store,
    scheduler,
    settings,
    storage: createInMemoryHydrationStorage(store),
    reminders: createReminderService({ scheduler, permissions, settings }),
  };
}

type App = ReturnType<typeof build>;

/** Renders the tabs and waits for the today screen's first read to settle. */
async function open(app: App = build()): Promise<App> {
  render(
    <AppTabs
      storage={app.storage}
      settings={app.settings}
      reminders={app.reminders}
      now={now}
    />,
  );

  await screen.findByLabelText(statLabel(TOTAL_LABEL, 0));

  return app;
}

/** Moves to a tab the way a finger does. */
function goTo(name: AppTabName): void {
  fireEvent.press(screen.getByLabelText(tabLabel(name)));
}

/**
 * Lets the re-read that a write sets off finish inside the test rather than
 * after it, where React has no way to tell it apart from a leak.
 */
const settle = (): Promise<void> => act(async () => {});

describe('AppTabs', () => {
  it('offers a tab for every screen', async () => {
    await open();

    for (const name of APP_TABS) {
      expect(screen.getByLabelText(tabLabel(name))).toBeOnTheScreen();
    }
  });

  it('opens on the today screen, with logging and undo in reach', async () => {
    await open();

    expect(screen.getByRole('button', { name: glassButtonLabel(250) })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: UNDO_LABEL })).toBeOnTheScreen();
    expect(screen.getByLabelText(statLabel(GOAL_LABEL, 2000))).toBeOnTheScreen();
  });

  it('reaches the history screen', async () => {
    await open();

    goTo(HISTORY_TAB);

    expect(await screen.findByText(streakSummary(0))).toBeOnTheScreen();
  });

  it('reaches the goal screen, so the goal can still be changed', async () => {
    const app = await open();

    goTo(GOAL_TAB);

    fireEvent.changeText(await screen.findByLabelText(GOAL_INPUT_LABEL), '1500');
    fireEvent.press(screen.getByRole('button', { name: 'Save goal' }));

    await waitFor(async () => {
      expect(await app.storage.readGoal()).toEqual(createGoal(1500));
    });
    await settle();
  });

  it('reaches the settings screen', async () => {
    await open();

    goTo(SETTINGS_TAB);

    expect(
      await screen.findByLabelText(switchLabel(REMINDERS_LABEL, true)),
    ).toBeOnTheScreen();
  });

  it('shows a glass logged on today in the history read afterwards', async () => {
    const app = await open();

    fireEvent.press(screen.getByRole('button', { name: glassButtonLabel(500) }));
    await screen.findByLabelText(statLabel(TOTAL_LABEL, 500));
    expect(await app.storage.readDay(TODAY)).not.toBeNull();

    goTo(HISTORY_TAB);

    expect(await screen.findByText('500 ml of 2000 ml')).toBeOnTheScreen();
  });

  it('shows a goal changed on the goal screen on the today screen', async () => {
    await open();

    goTo(GOAL_TAB);
    fireEvent.changeText(await screen.findByLabelText(GOAL_INPUT_LABEL), '1200');
    fireEvent.press(screen.getByRole('button', { name: 'Save goal' }));

    goTo(TODAY_TAB);

    expect(await screen.findByLabelText(statLabel(GOAL_LABEL, 1200))).toBeOnTheScreen();
  });

  it('gives every screen the one reminder service rather than one each', async () => {
    const app = await open();

    fireEvent.press(screen.getByRole('button', { name: glassButtonLabel(250) }));

    await waitFor(() => {
      expect(app.scheduler.pending()).toHaveLength(1);
    });

    // Switching reminders off has to cancel what the today screen scheduled,
    // which is only true if both screens are holding the same service.
    goTo(SETTINGS_TAB);
    fireEvent.press(await screen.findByLabelText(switchLabel(REMINDERS_LABEL, true)));

    await waitFor(() => {
      expect(app.scheduler.pending()).toHaveLength(0);
    });
  });
});
