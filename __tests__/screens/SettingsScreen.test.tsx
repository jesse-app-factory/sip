/**
 * The settings screen: the interval, the quiet-hours window, and the off
 * switch.
 *
 * Each test renders the screen over the in-memory storage and the fake
 * scheduler and asserts on both halves of what a setting has to do — that it
 * reached storage, and that the device would have been asked to reschedule
 * accordingly. A setting that is stored but leaves a pending reminder where it
 * was has not been applied, and docs/functional-spec.md, "Reminders", is about
 * what is scheduled.
 *
 * No notification is scheduled and no permission requested for real, per
 * docs/testing-strategy.md, and the clock is injected, so the fire times below
 * are arithmetic rather than whenever the suite happened to run.
 *
 * The moments are built from local parts, because quiet hours are local times:
 * the assertions therefore hold in whichever zone the suite runs in.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createDay, createEntry, createGoal, toLocalDate } from '../../src/domain';
import { createFakeReminderScheduler } from '../../src/notifications/fakeScheduler';
import { createQuietHours } from '../../src/notifications/quietHours';
import { createReminderService } from '../../src/notifications/reminderService';
import {
  createReminderSettings,
  REMINDER_INTERVAL_MS,
  SUGGESTED_QUIET_HOURS,
} from '../../src/notifications/settings';
import {
  EMPTY_WINDOW_MESSAGE,
  intervalOptionLabel,
  intervalSummary,
  INVALID_TIME_MESSAGE,
  QUIET_HOURS_END_LABEL,
  QUIET_HOURS_LABEL,
  QUIET_HOURS_START_LABEL,
  quietHoursSummary,
  REMINDERS_LABEL,
  REMINDERS_OFF_MESSAGE,
  SAVE_QUIET_HOURS_LABEL,
  SETTINGS_LOADING_MESSAGE,
  SETTINGS_WRITE_FAILED_MESSAGE,
  SettingsScreen,
  switchLabel,
} from '../../src/screens';
import {
  createInMemoryHydrationStorage,
  createInMemoryKeyValueStore,
  createNotificationPermissionStorage,
  createReminderSettingsStorage,
  InMemoryKeyValueStore,
  ReminderSettingsStorage,
} from '../../src/storage';

/** A local moment, so the local quiet-hours window means what it says. */
const local = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date => new Date(year, month - 1, day, hour, minute, 0, 0);

/** Mid-morning, well clear of any night-time window. */
const NOW = local(2026, 8, 18, 10);

const minutes = (count: number): number => count * 60 * 1000;
const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);
const iso = (offsetMs: number): string => at(offsetMs).toISOString();

const TODAY = toLocalDate(NOW);
const NIGHT = createQuietHours('22:00', '07:00');

/** The app as it is composed for a test: one store, one scheduler, one screen. */
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

/** Renders the screen and waits for the stored settings to arrive. */
async function open(
  app: App,
  clock: () => Date = () => NOW,
  settings: ReminderSettingsStorage = app.settings,
): Promise<void> {
  render(
    <SettingsScreen
      settings={settings}
      storage={app.storage}
      reminders={app.reminders}
      now={clock}
    />,
  );

  await waitFor(() => expect(screen.queryByText(SETTINGS_LOADING_MESSAGE)).toBeNull());
}

/** The reminder the app already had pending when the user opened settings. */
async function alreadyPending(app: App, now: Date = NOW): Promise<string> {
  const day = (await app.storage.readDay(toLocalDate(now))) ?? createDay(TODAY, createGoal(2000));
  await app.reminders.sync(day, now);

  return app.scheduler.pending()[0].id;
}

const pressSwitch = (name: string, on: boolean): void => {
  fireEvent.press(screen.getByLabelText(switchLabel(name, on)));
};

const pressInterval = (ms: number): void => {
  fireEvent.press(screen.getByRole('button', { name: intervalOptionLabel(ms) }));
};

const saveQuietHours = (start: string, end: string): void => {
  fireEvent.changeText(screen.getByLabelText(QUIET_HOURS_START_LABEL), start);
  fireEvent.changeText(screen.getByLabelText(QUIET_HOURS_END_LABEL), end);
  fireEvent.press(screen.getByRole('button', { name: SAVE_QUIET_HOURS_LABEL }));
};

describe('opening the settings', () => {
  it('shows the defaults when nothing has been changed', async () => {
    await open(build());

    expect(screen.getByText(intervalSummary(REMINDER_INTERVAL_MS))).toBeTruthy();
    expect(screen.getByText(quietHoursSummary(null))).toBeTruthy();
    expect(screen.getByLabelText(switchLabel(REMINDERS_LABEL, true))).toBeTruthy();
    expect(screen.getByLabelText(switchLabel(QUIET_HOURS_LABEL, false))).toBeTruthy();
  });

  it('shows what a previous run of the app stored', async () => {
    const app = build();
    await app.settings.writeReminderSettings(
      createReminderSettings({ enabled: false, intervalMs: minutes(45), quietHours: NIGHT }),
    );

    // A screen built afresh over the same store is the app being reopened.
    await open(build(app.store));

    expect(screen.getByText(intervalSummary(minutes(45)))).toBeTruthy();
    expect(screen.getByText(quietHoursSummary(NIGHT))).toBeTruthy();
    expect(screen.getByLabelText(switchLabel(REMINDERS_LABEL, false))).toBeTruthy();
    expect(screen.getByLabelText(switchLabel(QUIET_HOURS_LABEL, true))).toBeTruthy();
    expect(screen.getByText(REMINDERS_OFF_MESSAGE)).toBeTruthy();
  });
});

describe('changing the interval', () => {
  it('stores it and reschedules the pending reminder against it', async () => {
    const app = build();
    const pending = await alreadyPending(app);
    expect(app.scheduler.pending()[0].fireAt).toBe(iso(REMINDER_INTERVAL_MS));
    await open(app);

    pressInterval(minutes(30));

    await waitFor(() => expect(app.scheduler.cancelled()).toEqual([pending]));
    expect(app.scheduler.pending()).toHaveLength(1);
    expect(app.scheduler.pending()[0].fireAt).toBe(iso(minutes(30)));
    expect(await app.settings.readReminderSettings()).toEqual(
      createReminderSettings({ intervalMs: minutes(30) }),
    );
  });

  it('counts the new interval from the most recent glass, not from now', async () => {
    const app = build();
    await app.storage.writeDay(
      createDay(TODAY, createGoal(2000), [createEntry(250, at(-minutes(10)))]),
    );
    await alreadyPending(app);
    await open(app);

    pressInterval(minutes(90));

    await waitFor(() => expect(app.scheduler.pending()).toHaveLength(1));
    expect(app.scheduler.pending()[0].fireAt).toBe(iso(minutes(80)));
  });

  it('survives the app being reopened', async () => {
    const app = build();
    await open(app);
    pressInterval(minutes(180));
    await waitFor(() => expect(screen.getByText(intervalSummary(minutes(180)))).toBeTruthy());

    screen.unmount();
    await open(build(app.store));

    expect(screen.getByText(intervalSummary(minutes(180)))).toBeTruthy();
  });
});

describe('quiet hours', () => {
  it('are stored, and keep a reminder from being scheduled inside them', async () => {
    // Half past nine at night: the next reminder would otherwise be due at
    // half past eleven, inside the window about to be set.
    const evening = local(2026, 8, 18, 21, 30);
    const app = build();
    await open(app, () => evening);

    saveQuietHours('22:00', '07:00');

    await waitFor(() => expect(app.scheduler.pending()).toHaveLength(1));
    expect(app.scheduler.pending()[0].fireAt).toBe(local(2026, 8, 19, 7).toISOString());
    expect((await app.settings.readReminderSettings()).quietHours).toEqual({
      start: '22:00',
      end: '07:00',
    });
  });

  it('are one continuous night when the window crosses midnight', async () => {
    // Half past midnight, inside a window whose start is after its end. An
    // implementation reading that as an empty range would schedule a reminder
    // for half past two in the morning.
    const smallHours = local(2026, 8, 19, 0, 30);
    const app = build();
    await open(app, () => smallHours);

    saveQuietHours('22:00', '07:00');

    await waitFor(() => expect(app.scheduler.pending()).toHaveLength(1));
    expect(app.scheduler.pending()[0].fireAt).toBe(local(2026, 8, 19, 7).toISOString());
  });

  it('leave a reminder due outside the window alone', async () => {
    const app = build();
    await open(app);

    saveQuietHours('22:00', '07:00');

    // Mid-morning, so the reminder two hours from now is nowhere near it.
    await waitFor(() => expect(app.scheduler.pending()).toHaveLength(1));
    expect(app.scheduler.pending()[0].fireAt).toBe(iso(REMINDER_INTERVAL_MS));
  });

  it('are switched on with the suggested night window in one press', async () => {
    const app = build();
    await open(app);

    pressSwitch(QUIET_HOURS_LABEL, false);

    await waitFor(() =>
      expect(screen.getByText(quietHoursSummary(SUGGESTED_QUIET_HOURS))).toBeTruthy(),
    );
    expect((await app.settings.readReminderSettings()).quietHours).toEqual(
      SUGGESTED_QUIET_HOURS,
    );
  });

  it('are switched off again, and stop moving reminders', async () => {
    const evening = local(2026, 8, 18, 21, 30);
    const app = build();
    await app.settings.writeReminderSettings(createReminderSettings({ quietHours: NIGHT }));
    const pending = await alreadyPending(app, evening);
    expect(app.scheduler.pending()[0].fireAt).toBe(local(2026, 8, 19, 7).toISOString());
    await open(app, () => evening);

    pressSwitch(QUIET_HOURS_LABEL, true);

    await waitFor(() => expect(app.scheduler.cancelled()).toEqual([pending]));
    expect(app.scheduler.pending()[0].fireAt).toBe(
      new Date(evening.getTime() + REMINDER_INTERVAL_MS).toISOString(),
    );
    expect((await app.settings.readReminderSettings()).quietHours).toBeNull();
  });

  it.each([
    ['a start that is not a time', '7pm', '07:00'],
    ['an end that is not a time', '22:00', '7'],
    ['an hour that does not exist', '25:00', '07:00'],
    ['a minute that does not exist', '22:70', '07:00'],
  ])('are refused, and nothing is written, for %s', async (_name, start, end) => {
    const app = build();
    await open(app);

    saveQuietHours(start, end);

    expect(await screen.findByText(INVALID_TIME_MESSAGE)).toBeTruthy();
    expect((await app.settings.readReminderSettings()).quietHours).toBeNull();
    expect(app.scheduler.all()).toEqual([]);
  });

  it('are refused when they would cover no time at all', async () => {
    const app = build();
    await open(app);

    saveQuietHours('08:00', '08:00');

    expect(await screen.findByText(EMPTY_WINDOW_MESSAGE)).toBeTruthy();
    expect((await app.settings.readReminderSettings()).quietHours).toBeNull();
  });

  it('survive the app being reopened', async () => {
    const app = build();
    await open(app);
    saveQuietHours('23:15', '06:45');
    await waitFor(() =>
      expect(screen.getByText(quietHoursSummary(createQuietHours('23:15', '06:45')))).toBeTruthy(),
    );

    screen.unmount();
    await open(build(app.store));

    expect(screen.getByText(quietHoursSummary(createQuietHours('23:15', '06:45')))).toBeTruthy();
    expect(screen.getByLabelText(switchLabel(QUIET_HOURS_LABEL, true))).toBeTruthy();
  });
});

describe('switching reminders off', () => {
  it('cancels everything already scheduled', async () => {
    const app = build();
    const pending = await alreadyPending(app);
    await open(app);

    pressSwitch(REMINDERS_LABEL, true);

    await waitFor(() => expect(app.scheduler.cancelled()).toEqual([pending]));
    expect(app.scheduler.pending()).toEqual([]);
    expect((await app.settings.readReminderSettings()).enabled).toBe(false);
  });

  it('schedules nothing further, however the settings are changed', async () => {
    const app = build();
    await open(app);
    pressSwitch(REMINDERS_LABEL, true);
    await waitFor(() => expect(screen.getByText(REMINDERS_OFF_MESSAGE)).toBeTruthy());

    pressInterval(minutes(30));
    saveQuietHours('22:00', '07:00');
    // Everything those changes could schedule has been done by now.
    await act(async () => {});

    expect(app.scheduler.all()).toEqual([]);
  });

  it('stays off when the app is reopened, and schedules nothing then either', async () => {
    const app = build();
    await open(app);
    pressSwitch(REMINDERS_LABEL, true);
    await waitFor(() => expect(screen.getByText(REMINDERS_OFF_MESSAGE)).toBeTruthy());
    screen.unmount();

    const relaunched = build(app.store);
    await relaunched.reminders.sync(createDay(TODAY, createGoal(2000)), NOW);
    await open(relaunched);

    expect(screen.getByLabelText(switchLabel(REMINDERS_LABEL, false))).toBeTruthy();
    expect(relaunched.scheduler.all()).toEqual([]);
  });

  it('schedules again once they are switched back on', async () => {
    const store = createInMemoryKeyValueStore();
    await createReminderSettingsStorage(store).writeReminderSettings(
      createReminderSettings({ enabled: false }),
    );
    const app = build(store);
    await open(app);

    pressSwitch(REMINDERS_LABEL, false);

    await waitFor(() => expect(app.scheduler.pending()).toHaveLength(1));
    expect(app.scheduler.pending()[0].fireAt).toBe(iso(REMINDER_INTERVAL_MS));
  });
});

describe('when storage refuses a write', () => {
  it('says so, and leaves the settings as they were', async () => {
    const app = build();
    const refusing: ReminderSettingsStorage = {
      readReminderSettings: () => app.settings.readReminderSettings(),
      writeReminderSettings: () => Promise.reject(new Error('storage is unavailable')),
    };
    await open(app, () => NOW, refusing);

    pressInterval(minutes(30));

    expect(await screen.findByText(SETTINGS_WRITE_FAILED_MESSAGE)).toBeTruthy();
    expect(screen.getByText(intervalSummary(REMINDER_INTERVAL_MS))).toBeTruthy();
    expect(await app.settings.readReminderSettings()).toEqual(
      createReminderSettings({ intervalMs: REMINDER_INTERVAL_MS }),
    );
  });
});
