/**
 * What the user controls about reminders, as a value.
 *
 * These are plain function calls against plain values: no storage, no
 * scheduler, no clock. What the settings *do* is asserted in
 * `reminder.test.ts` and `reminderService.test.ts`; this suite is about what
 * counts as a setting at all, and what the defaults are — which is what
 * `storage/reminderSettings.ts` falls back to for anything unreadable.
 */
import { createQuietHours } from '../../src/notifications/quietHours';
import {
  assertIntervalMs,
  assertReminderSettings,
  createReminderSettings,
  defaultReminderSettings,
  REMINDER_INTERVAL_MS,
  SUGGESTED_QUIET_HOURS,
} from '../../src/notifications/settings';

describe('the defaults', () => {
  it('are reminders on, every two hours, with no quiet hours', () => {
    expect(defaultReminderSettings()).toEqual({
      enabled: true,
      intervalMs: 2 * 60 * 60 * 1000,
      quietHours: null,
    });
    expect(REMINDER_INTERVAL_MS).toBe(2 * 60 * 60 * 1000);
  });

  it('are a fresh value each time, so no caller can change another’s', () => {
    const one = defaultReminderSettings();
    const two = defaultReminderSettings();

    expect(one).not.toBe(two);
    expect(one).toEqual(two);
  });

  it('offer the night as the window to switch quiet hours on with', () => {
    expect(SUGGESTED_QUIET_HOURS).toEqual({ start: '22:00', end: '07:00' });
  });
});

describe('building settings', () => {
  it('changes one setting and leaves the rest at their defaults', () => {
    expect(createReminderSettings({ intervalMs: 45 * 60 * 1000 })).toEqual({
      enabled: true,
      intervalMs: 45 * 60 * 1000,
      quietHours: null,
    });
  });

  it('keeps a window that crosses midnight as it was given', () => {
    const settings = createReminderSettings({ quietHours: createQuietHours('22:00', '07:00') });

    expect(settings.quietHours).toEqual({ start: '22:00', end: '07:00' });
  });

  it('carries nothing an older or newer version of the app wrote', () => {
    const settings = createReminderSettings({
      enabled: false,
      quietHours: { start: '22:00', end: '07:00', weekendsOnly: true },
    } as Parameters<typeof createReminderSettings>[0]);

    expect(settings.quietHours).toEqual({ start: '22:00', end: '07:00' });
    expect(settings).toEqual({
      enabled: false,
      intervalMs: REMINDER_INTERVAL_MS,
      quietHours: { start: '22:00', end: '07:00' },
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses %p as an interval, which could never fire',
    (intervalMs) => {
      expect(() => assertIntervalMs(intervalMs)).toThrow(TypeError);
      expect(() => createReminderSettings({ intervalMs })).toThrow(TypeError);
    },
  );

  it('refuses a window that is not a pair of times', () => {
    expect(() =>
      createReminderSettings({
        quietHours: { start: '22:00', end: 'morning' },
      } as Parameters<typeof createReminderSettings>[0]),
    ).toThrow(TypeError);
  });

  it('refuses anything that is not settings at all', () => {
    expect(() => assertReminderSettings(null)).toThrow(TypeError);
    expect(() => assertReminderSettings('on')).toThrow(TypeError);
    expect(() => assertReminderSettings({ intervalMs: 1000, quietHours: null })).toThrow(
      TypeError,
    );
    expect(() => assertReminderSettings({ enabled: 'yes', intervalMs: 1000 })).toThrow(
      TypeError,
    );
  });

  it('accepts settings it built itself', () => {
    expect(() =>
      assertReminderSettings(
        createReminderSettings({ enabled: false, quietHours: SUGGESTED_QUIET_HOURS }),
      ),
    ).not.toThrow();
  });
});
