/**
 * Remembering how the user wants to be reminded.
 *
 * The interval, the quiet-hours window and the off switch are all settings,
 * and settings survive the app being closed — so they belong here, next to the
 * goal, the days and the recorded permission, under their own key. Writing a
 * setting rewrites none of the others, per docs/architecture.md, "Storage
 * layout".
 *
 * What a setting *is* is `notifications/settings.ts`'s to define; storage only
 * files the answer away. That module imports nothing platform-shaped, so
 * depending on it costs this layer no platform dependency — the same
 * arrangement as `notificationPermission.ts` and the three permission states.
 *
 * ## Documented defaults
 *
 * Reading tolerates everything a real device accumulates, per
 * docs/functional-spec.md, "Data".
 *
 * | Stored value                            | Read back as                       |
 * | --------------------------------------- | ---------------------------------- |
 * | absent, empty or blank                   | the default settings               |
 * | not valid JSON, or JSON of another shape | the default settings               |
 * | a record with one unreadable setting     | that record, that setting defaulted |
 * | quiet hours that are not two `HH:MM`s    | that record, with no quiet hours    |
 *
 * A single unreadable field costs one setting rather than all three: a
 * truncated interval must not silently discard the quiet hours the user set,
 * because the cost of losing those is being woken at three in the morning.
 */
import { isQuietHours, QuietHours } from '../notifications/quietHours';
import {
  assertIntervalMs,
  assertReminderSettings,
  createReminderSettings,
  defaultReminderSettings,
  ReminderSettings,
} from '../notifications/settings';
import { REMINDER_SETTINGS_KEY } from './keys';
import { KeyValueStore } from './keyValueStore';

export interface ReminderSettingsStorage {
  /**
   * The stored settings, or the documented defaults for anything unreadable.
   * Never throws.
   */
  readReminderSettings(): Promise<ReminderSettings>;

  /**
   * Replaces the stored settings. Throws `TypeError` for settings that could
   * not be acted on — an interval of zero, a malformed window — and resolves
   * once they are stored.
   */
  writeReminderSettings(settings: ReminderSettings): Promise<void>;
}

/** Encodes the settings. Throws `TypeError` if they are not valid settings. */
export function encodeReminderSettings(settings: ReminderSettings): string {
  assertReminderSettings(settings);

  return JSON.stringify({
    enabled: settings.enabled,
    intervalMs: settings.intervalMs,
    quietHours:
      settings.quietHours === null
        ? null
        : { start: settings.quietHours.start, end: settings.quietHours.end },
  });
}

/** JSON, or `undefined` for anything unparseable — including `null` itself. */
function parseJson(raw: string | null): unknown {
  if (raw === null || raw.trim() === '') {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Whether a stored interval is one a reminder could actually be scheduled for. */
function isUsableInterval(value: unknown): value is number {
  try {
    assertIntervalMs(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decodes the settings, falling back to the documented defaults field by
 * field.
 */
export function decodeReminderSettings(raw: string | null): ReminderSettings {
  const parsed = parseJson(raw);
  const defaults = defaultReminderSettings();

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return defaults;
  }

  const record = parsed as { enabled?: unknown; intervalMs?: unknown; quietHours?: unknown };
  const quietHours: QuietHours | null = isQuietHours(record.quietHours)
    ? { start: record.quietHours.start, end: record.quietHours.end }
    : defaults.quietHours;

  // Every field has been checked by now, so nothing below can throw: an
  // unreadable record yields defaults rather than an error, and one unreadable
  // field costs one setting.
  return createReminderSettings({
    enabled: typeof record.enabled === 'boolean' ? record.enabled : defaults.enabled,
    intervalMs: isUsableInterval(record.intervalMs) ? record.intervalMs : defaults.intervalMs,
    quietHours,
  });
}

/**
 * Builds the record over any key-value store. The store is the only thing that
 * differs between the device and a test.
 */
export function createReminderSettingsStorage(store: KeyValueStore): ReminderSettingsStorage {
  return {
    async readReminderSettings(): Promise<ReminderSettings> {
      return decodeReminderSettings(await store.read(REMINDER_SETTINGS_KEY));
    },

    async writeReminderSettings(settings: ReminderSettings): Promise<void> {
      // Encoded before the write so invalid settings throw instead of landing
      // in storage half-formed.
      await store.write(REMINDER_SETTINGS_KEY, encodeReminderSettings(settings));
    },
  };
}
