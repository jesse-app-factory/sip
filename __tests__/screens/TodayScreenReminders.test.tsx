/**
 * The screen and the reminder that follows from logging a glass.
 *
 * docs/architecture.md, "Data flow, logging a glass", step 5: the screen
 * "cancels the pending reminder and schedules the next through the
 * notification interface". These render the screen over the in-memory storage
 * and the fake scheduler and assert what the device would have been asked to
 * do — no notification is scheduled and no permission is requested for real,
 * per docs/testing-strategy.md.
 *
 * The clock is injected, so the reminder times below are arithmetic rather
 * than whatever moment the suite happened to run at.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createDay, createEntry, createGoal, toLocalDate } from '../../src/domain';
import { createFakeReminderScheduler } from '../../src/notifications/fakeScheduler';
import { NotificationPermission } from '../../src/notifications/permission';
import { REMINDER_INTERVAL_MS } from '../../src/notifications/reminder';
import { createReminderService } from '../../src/notifications/reminderService';
import { glassButtonLabel, statLabel, TodayScreen, TOTAL_LABEL } from '../../src/screens';
import {
  createInMemoryHydrationStorage,
  createInMemoryKeyValueStore,
  createNotificationPermissionStorage,
  HydrationStorage,
  InMemoryKeyValueStore,
} from '../../src/storage';

/** A fixed moment, so which day is "today" never depends on when this runs. */
const NOW = new Date('2026-08-18T10:00:00.000Z');

const minutes = (count: number): number => count * 60 * 1000;
const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);
const iso = (offsetMs: number): string => at(offsetMs).toISOString();

const TODAY = toLocalDate(NOW);

interface AppOptions {
  readonly permission?: NotificationPermission;
  readonly whenPrompted?: NotificationPermission;
  readonly store?: InMemoryKeyValueStore;
}

/** The app as it is composed for a test: one store, one scheduler, one screen. */
function build({
  permission = 'granted',
  whenPrompted = 'granted',
  store = createInMemoryKeyValueStore(),
}: AppOptions = {}) {
  const scheduler = createFakeReminderScheduler({ permission, whenPrompted });
  const permissions = createNotificationPermissionStorage(store);

  return {
    store,
    scheduler,
    storage: createInMemoryHydrationStorage(store),
    reminders: createReminderService({ scheduler, permissions }),
    recorded: () => permissions.readNotificationPermission(),
  };
}

/** Renders the screen and waits for today to arrive from storage. */
async function open(
  storage: HydrationStorage,
  reminders: ReturnType<typeof build>['reminders'],
  clock: () => Date = () => NOW,
) {
  render(<TodayScreen storage={storage} now={clock} reminders={reminders} />);

  await screen.findByLabelText(new RegExp(`^${TOTAL_LABEL}: `));
}

function tapGlass(amountMl: number): void {
  fireEvent.press(screen.getByRole('button', { name: glassButtonLabel(amountMl) }));
}

function findStat(label: string, amountMl: number) {
  return screen.findByLabelText(statLabel(label, amountMl));
}

describe('opening the app', () => {
  it('schedules a reminder for the interval after the last glass', async () => {
    const { scheduler, storage, reminders } = build();
    await storage.writeDay(
      createDay(TODAY, createGoal(2000), [createEntry(250, at(-minutes(30)))]),
    );

    await open(storage, reminders);

    await waitFor(() => expect(scheduler.pending()).toHaveLength(1));
    expect(scheduler.pending()[0].fireAt).toBe(iso(REMINDER_INTERVAL_MS - minutes(30)));
  });

  it('schedules one a full interval ahead on a day with nothing logged', async () => {
    const { scheduler, storage, reminders } = build();

    await open(storage, reminders);

    await waitFor(() => expect(scheduler.pending()).toHaveLength(1));
    expect(scheduler.pending()[0].fireAt).toBe(iso(REMINDER_INTERVAL_MS));
  });
});

describe('logging a glass', () => {
  it('cancels the pending reminder and schedules the next from that moment', async () => {
    const { scheduler, storage, reminders, store } = build();
    await storage.writeDay(
      createDay(TODAY, createGoal(2000), [createEntry(250, at(-minutes(30)))]),
    );
    let clock = NOW;
    await open(storage, reminders, () => clock);
    await waitFor(() => expect(scheduler.pending()).toHaveLength(1));
    const [first] = scheduler.all();

    // Twenty minutes later, the user logs a glass.
    clock = at(minutes(20));
    tapGlass(250);
    await findStat(TOTAL_LABEL, 500);

    await waitFor(() => expect(scheduler.cancelled()).toEqual([first.id]));
    expect(scheduler.pending()).toHaveLength(1);
    expect(scheduler.pending()[0].fireAt).toBe(iso(minutes(20) + REMINDER_INTERVAL_MS));
    // The glass itself is stored, whatever the notification system did.
    expect(await createInMemoryHydrationStorage(store).readDay(TODAY)).not.toBeNull();
  });

  it('leaves at most one reminder pending across several glasses', async () => {
    const { scheduler, storage, reminders } = build();
    await open(storage, reminders);
    await waitFor(() => expect(scheduler.pending()).toHaveLength(1));

    tapGlass(250);
    await findStat(TOTAL_LABEL, 250);
    tapGlass(500);
    await findStat(TOTAL_LABEL, 750);

    await waitFor(() => expect(scheduler.all()).toHaveLength(3));
    expect(scheduler.pending()).toHaveLength(1);
  });
});

describe('once the goal is met', () => {
  it('cancels the pending reminder and schedules no further one', async () => {
    const { scheduler, storage, reminders } = build();
    await storage.writeGoal(createGoal(500));
    await open(storage, reminders);
    await waitFor(() => expect(scheduler.pending()).toHaveLength(1));
    const [first] = scheduler.all();

    tapGlass(500);
    await findStat(TOTAL_LABEL, 500);

    await waitFor(() => expect(scheduler.pending()).toEqual([]));
    expect(scheduler.cancelled()).toEqual([first.id]);

    // A further glass on a day already met schedules nothing either.
    tapGlass(200);
    await findStat(TOTAL_LABEL, 700);
    // Everything the second sync could do has been done by now.
    await act(async () => {});
    expect(scheduler.all()).toHaveLength(1);
  });
});

describe('when notification permission is denied', () => {
  it('logs and shows the glass anyway, and records the denial', async () => {
    const { scheduler, storage, reminders, recorded, store } = build({
      permission: 'undetermined',
      whenPrompted: 'denied',
    });

    await open(storage, reminders);
    tapGlass(250);
    await findStat(TOTAL_LABEL, 250);

    await waitFor(async () => expect(await recorded()).toBe('denied'));
    expect(scheduler.all()).toEqual([]);
    // The glass reached storage: a refused notification is not a failed log.
    expect(await createInMemoryHydrationStorage(store).readDay(TODAY)).not.toBeNull();
  });

  it('does not ask again when the app is opened afresh', async () => {
    const store = createInMemoryKeyValueStore();
    const first = build({ permission: 'undetermined', whenPrompted: 'denied', store });
    await open(first.storage, first.reminders);
    tapGlass(250);
    await findStat(TOTAL_LABEL, 250);
    await waitFor(() => expect(first.scheduler.prompts()).toBe(1));

    // The app closes and opens again over what it recorded.
    screen.unmount();
    const relaunched = build({ permission: 'undetermined', whenPrompted: 'granted', store });
    await open(relaunched.storage, relaunched.reminders);
    tapGlass(250);
    await findStat(TOTAL_LABEL, 500);

    expect(relaunched.scheduler.prompts()).toBe(0);
    expect(relaunched.scheduler.all()).toEqual([]);
  });
});
