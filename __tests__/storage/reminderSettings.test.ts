/**
 * The reminder settings, stored and read back.
 *
 * Every test runs against the in-memory store — no test calls AsyncStorage,
 * per docs/testing-strategy.md — and the same encoding runs on the device, so
 * what is asserted here is what a phone would hold.
 *
 * The suite covers the three things the settings have to do: survive the app
 * being closed and opened, keep out of the way of the goal and the days, and
 * fall back to documented defaults for anything unreadable, per
 * docs/functional-spec.md, "Data".
 *
 * Raw strings go in through the store's `seed`, which bypasses the encoder —
 * the only way to reproduce a value the encoder would never have produced.
 */
import { createGoal } from '../../src/domain';
import { createQuietHours } from '../../src/notifications/quietHours';
import {
  createReminderSettings,
  defaultReminderSettings,
  REMINDER_INTERVAL_MS,
} from '../../src/notifications/settings';
import {
  createInMemoryHydrationStorage,
  createInMemoryKeyValueStore,
  createReminderSettingsStorage,
  decodeReminderSettings,
  encodeReminderSettings,
  GOAL_KEY,
  InMemoryKeyValueStore,
  REMINDER_SETTINGS_KEY,
} from '../../src/storage';

const NIGHT = createQuietHours('22:00', '07:00');

const minutes = (count: number): number => count * 60 * 1000;

function settingsOver(store: InMemoryKeyValueStore = createInMemoryKeyValueStore()) {
  return { store, settings: createReminderSettingsStorage(store) };
}

/** What a store holding that raw string reads back as. */
function stored(raw: string) {
  const store = createInMemoryKeyValueStore();
  store.seed(REMINDER_SETTINGS_KEY, raw);

  return createReminderSettingsStorage(store).readReminderSettings();
}

describe('storing settings', () => {
  it('reads back exactly what was written', async () => {
    const { settings } = settingsOver();
    const written = createReminderSettings({
      enabled: false,
      intervalMs: minutes(45),
      quietHours: NIGHT,
    });

    await settings.writeReminderSettings(written);

    await expect(settings.readReminderSettings()).resolves.toEqual(written);
  });

  it('keeps a window that crosses midnight as one that crosses midnight', async () => {
    const { settings } = settingsOver();

    await settings.writeReminderSettings(createReminderSettings({ quietHours: NIGHT }));

    expect((await settings.readReminderSettings()).quietHours).toEqual({
      start: '22:00',
      end: '07:00',
    });
  });

  it('survives the app being closed and opened again', async () => {
    const { store, settings } = settingsOver();
    await settings.writeReminderSettings(
      createReminderSettings({ intervalMs: minutes(90), quietHours: NIGHT }),
    );

    // A second storage over the same store is what relaunching the app is.
    const relaunched = createReminderSettingsStorage(store);

    await expect(relaunched.readReminderSettings()).resolves.toEqual({
      enabled: true,
      intervalMs: minutes(90),
      quietHours: { start: '22:00', end: '07:00' },
    });
  });

  it('uses one key of its own, and rewrites nothing else', async () => {
    const { store, settings } = settingsOver();
    const hydration = createInMemoryHydrationStorage(store);
    await hydration.writeGoal(createGoal(2500));
    const goalAsWritten = store.snapshot()[GOAL_KEY];

    await settings.writeReminderSettings(createReminderSettings({ enabled: false }));

    expect(Object.keys(store.snapshot()).sort()).toEqual(
      [GOAL_KEY, REMINDER_SETTINGS_KEY].sort(),
    );
    expect(store.snapshot()[GOAL_KEY]).toBe(goalAsWritten);
    await expect(hydration.readGoal()).resolves.toEqual({ amountMl: 2500 });
  });

  it('replaces the previous settings rather than adding to them', async () => {
    const { store, settings } = settingsOver();

    await settings.writeReminderSettings(createReminderSettings({ quietHours: NIGHT }));
    await settings.writeReminderSettings(createReminderSettings({ quietHours: null }));

    expect(Object.keys(store.snapshot())).toEqual([REMINDER_SETTINGS_KEY]);
    expect((await settings.readReminderSettings()).quietHours).toBeNull();
  });

  it('refuses settings that could never be acted on, and stores nothing', async () => {
    const { store, settings } = settingsOver();

    await expect(
      settings.writeReminderSettings({ enabled: true, intervalMs: 0, quietHours: null }),
    ).rejects.toThrow(TypeError);
    expect(() =>
      encodeReminderSettings({
        enabled: true,
        intervalMs: minutes(30),
        quietHours: { start: '22:00', end: 'later' },
      }),
    ).toThrow(TypeError);
    expect(store.snapshot()).toEqual({});
  });
});

describe('unreadable settings', () => {
  it('are the defaults when nothing has ever been written', async () => {
    const { settings } = settingsOver();

    await expect(settings.readReminderSettings()).resolves.toEqual(defaultReminderSettings());
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['truncated JSON', '{"enabled":'],
    ['not JSON at all', 'remind me sometimes'],
    ['JSON null', 'null'],
    ['a number', '7200000'],
    ['a string', '"on"'],
    ['an array', '[{"enabled":true}]'],
  ])('are the defaults when stored %s', async (_name, raw) => {
    await expect(stored(raw)).resolves.toEqual(defaultReminderSettings());
  });

  it('cost one setting rather than all three', async () => {
    // The interval is unusable, but the quiet hours are readable — and losing
    // those is the difference between a quiet night and a 3am notification.
    await expect(
      stored('{"enabled":false,"intervalMs":0,"quietHours":{"start":"22:00","end":"07:00"}}'),
    ).resolves.toEqual({
      enabled: false,
      intervalMs: REMINDER_INTERVAL_MS,
      quietHours: { start: '22:00', end: '07:00' },
    });
  });

  it.each([
    ['a start that is not a time', '{"quietHours":{"start":"bedtime","end":"07:00"}}'],
    ['no end', '{"quietHours":{"start":"22:00"}}'],
    ['a window that is a string', '{"quietHours":"22:00-07:00"}'],
    ['a window that is a number', '{"quietHours":7}'],
  ])('leave no quiet hours when the window has %s', async (_name, raw) => {
    // No window at all rather than a guessed one: a guess could suppress a
    // reminder the user never asked to suppress.
    expect((await stored(raw)).quietHours).toBeNull();
  });

  it('keep the settings a later version of the app can still read', async () => {
    // A record with a field this version knows nothing about is not corrupt.
    const settings = await stored(
      '{"enabled":true,"intervalMs":2700000,"quietHours":null,"weekends":"off"}',
    );

    expect(settings).toEqual({ enabled: true, intervalMs: minutes(45), quietHours: null });
  });

  it('are decoded the same way whether read through storage or directly', () => {
    expect(decodeReminderSettings(null)).toEqual(defaultReminderSettings());
    expect(decodeReminderSettings(encodeReminderSettings(defaultReminderSettings()))).toEqual(
      defaultReminderSettings(),
    );
  });
});
