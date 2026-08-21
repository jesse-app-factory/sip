/**
 * What would have been scheduled, and when.
 *
 * Every test here runs against the fake scheduler and the in-memory store, and
 * asserts on what the device *would* have been asked to do — per
 * docs/testing-strategy.md, "Notification tests": that a reminder was
 * scheduled at all, when, that logging cancels and reschedules, and that a met
 * goal schedules nothing. No test schedules a real notification or requests a
 * real permission; nothing here can, because nothing here reaches
 * `expo-notifications`.
 *
 * The current moment is passed in, so none of this depends on when the suite
 * runs.
 */
import { addEntry, createDay, createEntry, createGoal, Day, undoLastEntry } from '../../src/domain';
import { createFakeReminderScheduler } from '../../src/notifications/fakeScheduler';
import { NotificationPermission } from '../../src/notifications/permission';
import { createQuietHours } from '../../src/notifications/quietHours';
import { REMINDER_BODY, REMINDER_TITLE } from '../../src/notifications/reminder';
import { ReminderScheduler } from '../../src/notifications/reminderScheduler';
import { createReminderService } from '../../src/notifications/reminderService';
import {
  createReminderSettings,
  ReminderSettings,
  REMINDER_INTERVAL_MS,
} from '../../src/notifications/settings';
import {
  createInMemoryKeyValueStore,
  createNotificationPermissionStorage,
  createReminderSettingsStorage,
  encodeReminderSettings,
  InMemoryKeyValueStore,
  REMINDER_SETTINGS_KEY,
} from '../../src/storage';

/** A fixed moment, so which day is "today" never depends on when this runs. */
const NOW = new Date('2026-08-18T10:00:00.000Z');

const minutes = (count: number): number => count * 60 * 1000;
const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);
const iso = (offsetMs: number): string => at(offsetMs).toISOString();

const GOAL = createGoal(1000);

/** A day whose glasses were logged at the given offsets from `NOW`. */
function dayWith(...offsetsMs: number[]): Day {
  return offsetsMs.reduce(
    (day, offset) => addEntry(day, createEntry(200, at(offset))),
    createDay(NOW, GOAL),
  );
}

interface Built {
  readonly store: InMemoryKeyValueStore;
  readonly scheduler: ReturnType<typeof createFakeReminderScheduler>;
  readonly service: ReturnType<typeof createReminderService>;
  readonly recorded: () => Promise<NotificationPermission>;
  readonly settings: ReturnType<typeof createReminderSettingsStorage>;
}

interface BuildOptions {
  readonly permission?: NotificationPermission;
  readonly whenPrompted?: NotificationPermission;
  /** Whatever the user has changed about reminders, as if already stored. */
  readonly settings?: Partial<ReminderSettings>;
  /** An existing store, to model the app being closed and opened again. */
  readonly store?: InMemoryKeyValueStore;
  /** A stand-in for the fake, for the platform refusing to co-operate. */
  readonly scheduler?: ReminderScheduler;
}

function build({
  permission = 'granted',
  whenPrompted = 'granted',
  settings,
  store = createInMemoryKeyValueStore(),
  scheduler,
}: BuildOptions = {}): Built {
  const fake = createFakeReminderScheduler({ permission, whenPrompted });
  const permissions = createNotificationPermissionStorage(store);
  const settingsStorage = createReminderSettingsStorage(store);

  if (settings !== undefined) {
    // Seeded rather than written, so the settings are already in the store
    // before the first sync reads them — the app opening over what a previous
    // run stored.
    store.seed(REMINDER_SETTINGS_KEY, encodeReminderSettings(createReminderSettings(settings)));
  }

  return {
    store,
    scheduler: fake,
    service: createReminderService({
      scheduler: scheduler ?? fake,
      permissions,
      settings: settingsStorage,
    }),
    recorded: () => permissions.readNotificationPermission(),
    settings: settingsStorage,
  };
}

/** The fake with some of its methods replaced, for a platform that refuses. */
function refusing(overrides: Partial<ReminderScheduler>): ReminderScheduler {
  return { ...createFakeReminderScheduler({ permission: 'granted' }), ...overrides };
}

describe('scheduling the next reminder', () => {
  it('schedules one for the interval after the most recent glass', async () => {
    const { scheduler, service } = build();

    const reminder = await service.sync(dayWith(-minutes(30)), NOW);

    expect(reminder?.fireAt).toBe(iso(REMINDER_INTERVAL_MS - minutes(30)));
    expect(scheduler.pending()).toEqual([
      {
        id: expect.any(String),
        title: REMINDER_TITLE,
        body: REMINDER_BODY,
        fireAt: iso(REMINDER_INTERVAL_MS - minutes(30)),
      },
    ]);
  });

  it('schedules a full interval ahead on a day nothing has been logged against', async () => {
    const { scheduler, service } = build();

    await service.sync(dayWith(), NOW);

    expect(scheduler.pending()[0].fireAt).toBe(iso(REMINDER_INTERVAL_MS));
  });

  it('reminds the user to drink', async () => {
    const { scheduler, service } = build();

    await service.sync(dayWith(), NOW);

    expect(scheduler.pending()[0].body).toMatch(/water/i);
  });

  it('uses the interval the user stored', async () => {
    const { scheduler, service } = build({ settings: { intervalMs: minutes(45) } });

    await service.sync(dayWith(-minutes(15)), NOW);

    expect(scheduler.pending()[0].fireAt).toBe(iso(minutes(30)));
  });

  it('refuses to store an interval that could never fire', async () => {
    const { settings } = build();

    await expect(
      settings.writeReminderSettings({ enabled: true, intervalMs: 0, quietHours: null }),
    ).rejects.toThrow(TypeError);
    await expect(
      settings.writeReminderSettings({
        enabled: true,
        intervalMs: -minutes(5),
        quietHours: null,
      }),
    ).rejects.toThrow(TypeError);
  });

  it('falls back to the default interval when the stored settings are unreadable', async () => {
    const store = createInMemoryKeyValueStore();
    store.seed(REMINDER_SETTINGS_KEY, '{"intervalMs":');
    const { scheduler, service } = build({ store });

    await service.sync(dayWith(), NOW);

    expect(scheduler.pending()[0].fireAt).toBe(iso(REMINDER_INTERVAL_MS));
  });
});

describe('changing the interval', () => {
  it('reschedules the pending reminder against the new one', async () => {
    const { scheduler, service, settings } = build();
    await service.sync(dayWith(-minutes(15)), NOW);
    const [first] = scheduler.all();
    expect(first.fireAt).toBe(iso(REMINDER_INTERVAL_MS - minutes(15)));

    await settings.writeReminderSettings(createReminderSettings({ intervalMs: minutes(45) }));
    await service.sync(dayWith(-minutes(15)), NOW);

    expect(scheduler.cancelled()).toEqual([first.id]);
    expect(scheduler.pending()).toHaveLength(1);
    expect(scheduler.pending()[0].fireAt).toBe(iso(minutes(30)));
  });

  it('is in force for a service built afresh over the same store', async () => {
    const store = createInMemoryKeyValueStore();
    const first = build({ store });
    await first.settings.writeReminderSettings(
      createReminderSettings({ intervalMs: minutes(90) }),
    );

    // The app closes and opens again over what it stored.
    const relaunched = build({ store });
    await relaunched.service.sync(dayWith(), NOW);

    expect(relaunched.scheduler.pending()[0].fireAt).toBe(iso(minutes(90)));
  });
});

describe('quiet hours', () => {
  /** Local moments, because quiet hours are local. See the reminder tests. */
  const local = (year: number, month: number, day: number, hour: number, minute = 0): Date =>
    new Date(year, month - 1, day, hour, minute, 0, 0);

  const nightly = { quietHours: createQuietHours('22:00', '07:00') };

  it('schedules nothing inside the window, moving the reminder to its end', async () => {
    const oneAm = local(2026, 8, 18, 1);
    const { scheduler, service } = build({ settings: nightly });

    await service.sync(createDay(oneAm, GOAL), oneAm);

    expect(scheduler.pending()[0].fireAt).toBe(local(2026, 8, 18, 7).toISOString());
  });

  it('treats a window crossing midnight as one night', async () => {
    const evening = local(2026, 8, 18, 22, 30);
    const { scheduler, service } = build({ settings: nightly });

    await service.sync(createDay(evening, GOAL), evening);

    // Half past midnight is inside the window, so the reminder waits for
    // morning rather than being scheduled as if the window were empty.
    expect(scheduler.pending()[0].fireAt).toBe(local(2026, 8, 19, 7).toISOString());
  });

  it('stops moving reminders once the window is cleared', async () => {
    const oneAm = local(2026, 8, 18, 1);
    const { scheduler, service, settings } = build({ settings: nightly });
    await service.sync(createDay(oneAm, GOAL), oneAm);

    await settings.writeReminderSettings(createReminderSettings({ quietHours: null }));
    await service.sync(createDay(oneAm, GOAL), oneAm);

    expect(scheduler.pending()).toHaveLength(1);
    expect(scheduler.pending()[0].fireAt).toBe(local(2026, 8, 18, 3).toISOString());
  });
});

describe('switching reminders off', () => {
  it('cancels what was pending and schedules nothing further', async () => {
    const { scheduler, service, settings } = build();
    await service.sync(dayWith(-minutes(30)), NOW);
    const [pending] = scheduler.all();

    await settings.writeReminderSettings(createReminderSettings({ enabled: false }));

    await expect(service.sync(dayWith(-minutes(30)), NOW)).resolves.toBeNull();
    expect(scheduler.cancelled()).toEqual([pending.id]);
    expect(scheduler.pending()).toEqual([]);
    expect(scheduler.all()).toHaveLength(1);
  });

  it('schedules nothing on any later sync, and asks for no permission', async () => {
    const { scheduler, service } = build({
      permission: 'undetermined',
      settings: { enabled: false },
    });

    await service.sync(dayWith(), NOW);
    await service.sync(dayWith(-minutes(10)), at(minutes(10)));

    expect(scheduler.all()).toEqual([]);
    // Nothing is being scheduled, so there is nothing to ask permission for.
    expect(scheduler.prompts()).toBe(0);
  });

  it('schedules again once they are switched back on', async () => {
    const { scheduler, service, settings } = build({ settings: { enabled: false } });
    await service.sync(dayWith(), NOW);

    await settings.writeReminderSettings(createReminderSettings({ enabled: true }));
    await service.sync(dayWith(), NOW);

    expect(scheduler.pending()).toHaveLength(1);
    expect(scheduler.pending()[0].fireAt).toBe(iso(REMINDER_INTERVAL_MS));
  });

  it('stays off when the app is opened afresh', async () => {
    const store = createInMemoryKeyValueStore();
    const first = build({ store });
    await first.settings.writeReminderSettings(createReminderSettings({ enabled: false }));

    const relaunched = build({ store });
    await relaunched.service.sync(dayWith(), NOW);

    expect(relaunched.scheduler.all()).toEqual([]);
    expect((await relaunched.settings.readReminderSettings()).enabled).toBe(false);
  });
});

describe('logging a glass', () => {
  it('cancels the pending reminder and schedules the next from that moment', async () => {
    const { scheduler, service } = build();
    await service.sync(dayWith(-minutes(90)), NOW);
    const [first] = scheduler.all();

    // A glass, twenty minutes later.
    const later = at(minutes(20));
    await service.sync(addEntry(dayWith(-minutes(90)), createEntry(200, later)), later);

    expect(scheduler.cancelled()).toEqual([first.id]);
    expect(scheduler.pending()).toHaveLength(1);
    expect(scheduler.pending()[0].fireAt).toBe(iso(minutes(20) + REMINDER_INTERVAL_MS));
  });

  it('leaves at most one reminder pending, however many glasses are logged', async () => {
    const { scheduler, service } = build();
    let day = dayWith();

    for (const offset of [minutes(5), minutes(10), minutes(15)]) {
      day = addEntry(day, createEntry(100, at(offset)));
      await service.sync(day, at(offset));
    }

    expect(scheduler.all()).toHaveLength(3);
    expect(scheduler.pending()).toHaveLength(1);
    expect(scheduler.pending()[0].fireAt).toBe(iso(minutes(15) + REMINDER_INTERVAL_MS));
  });

  it('keeps cancelling and scheduling together when two glasses overlap', async () => {
    const { scheduler, service } = build();
    const first = dayWith(-minutes(30));
    const second = addEntry(first, createEntry(200, NOW));

    // Neither is awaited before the other starts, as two quick presses.
    await Promise.all([service.sync(first, NOW), service.sync(second, NOW)]);

    expect(scheduler.pending()).toHaveLength(1);
    expect(scheduler.cancelled()).toHaveLength(1);
  });
});

describe('once the day’s goal is met', () => {
  const met = dayWith(...Array.from({ length: 5 }, () => -minutes(5)));

  it('schedules nothing and cancels what was pending', async () => {
    const { scheduler, service } = build();
    await service.sync(dayWith(-minutes(30)), NOW);
    const [pending] = scheduler.all();

    const reminder = await service.sync(met, NOW);

    expect(reminder).toBeNull();
    expect(scheduler.cancelled()).toEqual([pending.id]);
    expect(scheduler.pending()).toEqual([]);
    expect(scheduler.all()).toHaveLength(1);
  });

  it('schedules nothing on any later sync that day', async () => {
    const { scheduler, service } = build();

    await service.sync(met, NOW);
    await service.sync(met, at(minutes(30)));
    await service.sync(met, at(minutes(90)));

    expect(scheduler.all()).toEqual([]);
  });

  it('schedules again once the goal stops being met', async () => {
    const { scheduler, service } = build();
    await service.sync(met, NOW);

    // Undo takes the day back under its goal.
    await service.sync(undoLastEntry(met), NOW);

    expect(scheduler.pending()).toHaveLength(1);
  });
});

describe('when the user is asked about notifications', () => {
  it('asks once when nothing has been recorded, and schedules on a grant', async () => {
    const { scheduler, service, recorded } = build({
      permission: 'undetermined',
      whenPrompted: 'granted',
    });

    await service.sync(dayWith(), NOW);
    await service.sync(dayWith(), at(minutes(5)));

    expect(scheduler.prompts()).toBe(1);
    expect(await recorded()).toBe('granted');
    expect(scheduler.pending()).toHaveLength(1);
  });

  it('does not ask at all when permission is already granted', async () => {
    const { scheduler, service } = build({ permission: 'granted' });

    await service.sync(dayWith(), NOW);

    expect(scheduler.prompts()).toBe(0);
    expect(scheduler.pending()).toHaveLength(1);
  });
});

describe('when notification permission is denied', () => {
  it('schedules nothing, raises nothing, and records the denial', async () => {
    const { scheduler, service, recorded } = build({
      permission: 'undetermined',
      whenPrompted: 'denied',
    });

    await expect(service.sync(dayWith(), NOW)).resolves.toBeNull();

    expect(scheduler.all()).toEqual([]);
    expect(await recorded()).toBe('denied');
  });

  it('does not ask again, however many times the day is synced', async () => {
    const { scheduler, service } = build({
      permission: 'undetermined',
      whenPrompted: 'denied',
    });

    await service.sync(dayWith(), NOW);
    await service.sync(dayWith(), at(minutes(5)));
    await service.sync(dayWith(), at(minutes(10)));

    expect(scheduler.prompts()).toBe(1);
  });

  it('does not ask again when the app is opened afresh', async () => {
    const store = createInMemoryKeyValueStore();
    const first = build({ permission: 'undetermined', whenPrompted: 'denied', store });
    await first.service.sync(dayWith(), NOW);

    // The app closes and opens again, over what it recorded. The platform is
    // asked nothing at all this time: the record is enough.
    const relaunched = build({ permission: 'undetermined', whenPrompted: 'granted', store });
    await relaunched.service.sync(dayWith(), NOW);

    expect(relaunched.scheduler.prompts()).toBe(0);
    expect(relaunched.scheduler.all()).toEqual([]);
    expect(await relaunched.recorded()).toBe('denied');
  });

  it('records a refusal the platform reports without a prompt', async () => {
    // Permission revoked in the operating system's settings, or never
    // grantable on this device.
    const { scheduler, service, recorded } = build({ permission: 'denied' });

    await expect(service.sync(dayWith(), NOW)).resolves.toBeNull();

    expect(scheduler.prompts()).toBe(0);
    expect(await recorded()).toBe('denied');
  });

  it('stops scheduling when a grant is revoked while the app is running', async () => {
    const { scheduler, service } = build({ permission: 'granted' });
    await service.sync(dayWith(), NOW);
    const [pending] = scheduler.all();

    scheduler.setPermission('denied');
    await service.sync(dayWith(-minutes(5)), at(minutes(5)));

    expect(scheduler.cancelled()).toEqual([pending.id]);
    expect(scheduler.pending()).toEqual([]);
  });
});

describe('when the platform refuses to co-operate', () => {
  it('answers null rather than throwing when scheduling fails', async () => {
    const { service } = build({
      scheduler: refusing({
        schedule: () => Promise.reject(new Error('scheduling is unavailable')),
      }),
    });

    await expect(service.sync(dayWith(), NOW)).resolves.toBeNull();
  });

  it('answers null rather than throwing when the permission check fails', async () => {
    const { service } = build({
      scheduler: refusing({
        getPermission: () => Promise.reject(new Error('no notification module')),
      }),
    });

    await expect(service.sync(dayWith(), NOW)).resolves.toBeNull();
  });

  it('still schedules the next reminder when a cancellation fails', async () => {
    const scheduled: string[] = [];
    const scheduler = refusing({
      cancel: () => Promise.reject(new Error('nothing to cancel')),
      schedule: async (reminder) => {
        scheduled.push(reminder.fireAt);
        return `id-${scheduled.length}`;
      },
    });
    const { service } = build({ scheduler });

    await service.sync(dayWith(), NOW);
    await service.sync(dayWith(-minutes(10)), at(minutes(10)));

    expect(scheduled).toHaveLength(2);
  });

  it('answers null rather than throwing when the settings cannot be read', async () => {
    const scheduler = createFakeReminderScheduler({ permission: 'granted' });
    const service = createReminderService({
      scheduler,
      permissions: createNotificationPermissionStorage(createInMemoryKeyValueStore()),
      settings: {
        readReminderSettings: () => Promise.reject(new Error('storage is unavailable')),
        writeReminderSettings: () => Promise.resolve(),
      },
    });

    await expect(service.sync(dayWith(), NOW)).resolves.toBeNull();
    expect(scheduler.all()).toEqual([]);
  });

  it('answers null rather than throwing when the record cannot be read', async () => {
    const scheduler = createFakeReminderScheduler({ permission: 'granted' });
    const service = createReminderService({
      scheduler,
      permissions: {
        readNotificationPermission: () => Promise.reject(new Error('storage is unavailable')),
        writeNotificationPermission: () => Promise.resolve(),
      },
      settings: createReminderSettingsStorage(createInMemoryKeyValueStore()),
    });

    await expect(service.sync(dayWith(), NOW)).resolves.toBeNull();
    expect(scheduler.all()).toEqual([]);
  });
});

describe('cancelling what is pending', () => {
  it('leaves nothing pending', async () => {
    const { scheduler, service } = build();
    await service.sync(dayWith(), NOW);
    const [pending] = scheduler.all();

    await service.cancelPending();

    expect(scheduler.cancelled()).toEqual([pending.id]);
    expect(scheduler.pending()).toEqual([]);
  });

  it('does nothing, and raises nothing, when there is nothing pending', async () => {
    const { scheduler, service } = build();

    await expect(service.cancelPending()).resolves.toBeUndefined();
    await expect(service.cancelPending()).resolves.toBeUndefined();

    expect(scheduler.cancelled()).toEqual([]);
  });

  it('cancels each reminder at most once', async () => {
    const { scheduler, service } = build();
    await service.sync(dayWith(), NOW);

    await service.cancelPending();
    await service.cancelPending();

    expect(scheduler.cancelled()).toHaveLength(1);
  });
});
