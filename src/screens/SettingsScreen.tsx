/**
 * Settings: how often to be reminded, when not to be, and whether at all.
 *
 * The screen owns two things and nothing else: turning presses and typed times
 * into settings, and moving valid settings through the storage interface.
 * What a valid setting *is* lives in `notifications/settings.ts`, what a quiet
 * window means lives in `notifications/quietHours.ts`, and how settings are
 * stored lives in `storage/reminderSettings.ts` — this file reaches all three
 * through their interfaces and touches no platform API, per
 * docs/architecture.md.
 *
 * ## A setting takes effect immediately
 *
 * docs/functional-spec.md, "Reminders", is about what is *scheduled*, so a
 * setting that has been stored but not applied is worth nothing: a new
 * interval has to move the pending reminder, and switching reminders off has
 * to cancel it.
 *
 * So every change here follows the same order as logging a glass, per
 * docs/architecture.md, "Data flow, logging a glass": write it, wait for the
 * write, show it, and then sync the reminder. The sync cancels whatever was
 * pending and schedules whatever the new settings make due — including nothing
 * at all, which is exactly what switching reminders off has to mean.
 *
 * The day handed to that sync is today as it actually stands, read back from
 * storage, so the rescheduled reminder counts from the user's most recent
 * glass rather than from this visit to the settings screen.
 *
 * ## Quiet hours are refused rather than silently emptied
 *
 * A window whose ends are the same minute covers nothing, and a user who typed
 * one did not mean "no quiet hours at all" — so it is rejected on screen and
 * nothing is written. A window that crosses midnight, on the other hand, is
 * the ordinary case and is accepted exactly like any other.
 *
 * ## Time
 *
 * The current moment arrives as a prop rather than from the clock, per
 * docs/technical-spec.md, "Time", so a test decides which day the rescheduled
 * reminder is counted against.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { createDay, toLocalDate } from '../domain';
// The two pure modules are imported directly rather than through
// `src/notifications`, whose barrel re-exports the device scheduler and would
// therefore load `expo-notifications` into this screen. The service and the
// settings arrive as types, which are erased.
import type { ReminderService, ReminderSettings } from '../notifications';
import {
  createQuietHours,
  describeQuietHours,
  isEmptyWindow,
  isTimeOfDay,
  QuietHours,
} from '../notifications/quietHours';
import {
  createReminderSettings,
  REMINDER_INTERVAL_MS,
  SUGGESTED_QUIET_HOURS,
} from '../notifications/settings';
import type { HydrationStorage, ReminderSettingsStorage } from '../storage';

const MINUTE_MS = 60 * 1000;

/**
 * The intervals offered, in milliseconds. Which intervals to offer is a
 * question about the screen rather than about hydration, so it is decided
 * here; what counts as a usable interval is still the one definition in
 * `notifications/settings.ts`, because every one of these goes through
 * `createReminderSettings`.
 */
export const INTERVAL_OPTIONS_MS: readonly number[] = [
  30 * MINUTE_MS,
  60 * MINUTE_MS,
  90 * MINUTE_MS,
  REMINDER_INTERVAL_MS,
  180 * MINUTE_MS,
  240 * MINUTE_MS,
];

/** What the two switches are called to a screen reader, and to a test. */
export const REMINDERS_LABEL = 'Reminders';
export const QUIET_HOURS_LABEL = 'Quiet hours';

/** What the two time fields and their save button are called. */
export const QUIET_HOURS_START_LABEL = 'Quiet hours start, as HH:MM';
export const QUIET_HOURS_END_LABEL = 'Quiet hours end, as HH:MM';
export const SAVE_QUIET_HOURS_LABEL = 'Save quiet hours';

/** Rejection messages. Exported so a test names the same string the user sees. */
export const INVALID_TIME_MESSAGE =
  'A time must be HH:MM on the 24-hour clock, for example 22:00.';
export const EMPTY_WINDOW_MESSAGE = 'Quiet hours must start and end at different times.';

/** Shown once a setting has reached storage, and when it could not. */
export const SETTINGS_SAVED_MESSAGE = 'Saved.';
export const SETTINGS_WRITE_FAILED_MESSAGE = 'That could not be saved. Please try again.';

/** Shown until the settings have been read back from storage. */
export const SETTINGS_LOADING_MESSAGE = 'Reading your settings…';

/** Shown in place of the interval and window when reminders are switched off. */
export const REMINDERS_OFF_MESSAGE = 'Reminders are off. Nothing is scheduled.';

/** A length of time as a person would say it: "2 hours", "1 hour 30 minutes". */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / MINUTE_MS);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }
  if (minutes > 0 || hours === 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }

  return parts.join(' ');
}

/** What one interval button is called: one press, one interval. */
export function intervalOptionLabel(ms: number): string {
  return `Every ${formatDuration(ms)}`;
}

/** How the stored interval reads back to the user. */
export function intervalSummary(ms: number): string {
  return `A reminder ${formatDuration(ms)} after your last glass.`;
}

/** How the stored window reads back to the user, including having none. */
export function quietHoursSummary(quietHours: QuietHours | null): string {
  return quietHours === null
    ? 'No quiet hours: a reminder can arrive at any time of day.'
    : `No reminder between ${describeQuietHours(quietHours)}.`;
}

/** How a switch reads with its state, so pressing and asserting name both. */
export function switchLabel(name: string, on: boolean): string {
  return `${name}: ${on ? 'on' : 'off'}`;
}

/**
 * Hoisted so that a screen rendered without a clock keeps the same one across
 * renders.
 */
const systemClock = (): Date => new Date();

export interface SettingsScreenProps {
  /** Where the settings are stored — the device one, or the fake. */
  readonly settings: ReminderSettingsStorage;
  /** The persistence interface, for the day a changed setting reschedules against. */
  readonly storage: HydrationStorage;
  /**
   * The reminder scheduling from TASK-008. A screen without one stores
   * settings and schedules nothing, and behaves identically otherwise.
   */
  readonly reminders?: ReminderService;
  /** The current moment, injected so tests decide which day is today. */
  readonly now?: () => Date;
  /** Told about every settings change that reached storage. */
  readonly onSettingsChanged?: (settings: ReminderSettings) => void;
}

export function SettingsScreen({
  settings,
  storage,
  reminders,
  now = systemClock,
  onSettingsChanged,
}: SettingsScreenProps) {
  const [stored, setStored] = useState<ReminderSettings | null>(null);
  const [start, setStart] = useState(SUGGESTED_QUIET_HOURS.start);
  const [end, setEnd] = useState(SUGGESTED_QUIET_HOURS.end);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Storage never rejects a read: unreadable settings come back as the
    // documented defaults, so there is no failure branch to render here.
    let current = true;

    settings.readReminderSettings().then((read) => {
      if (!current) {
        return;
      }

      setStored(read);
      if (read.quietHours !== null) {
        setStart(read.quietHours.start);
        setEnd(read.quietHours.end);
      }
    });

    return () => {
      current = false;
    };
  }, [settings]);

  /** Today as it actually stands, for the reminder a change reschedules. */
  const loadToday = useCallback(async () => {
    const at = now();
    const date = toLocalDate(at, 'Today');

    return {
      at,
      day: (await storage.readDay(date)) ?? createDay(date, await storage.readGoal()),
    };
  }, [now, storage]);

  const persist = useCallback(
    async (next: ReminderSettings): Promise<void> => {
      setSaving(true);
      try {
        await settings.writeReminderSettings(next);
      } catch {
        // Nothing below this ran, so what is on screen still matches what is
        // stored rather than a setting that was never saved.
        setError(SETTINGS_WRITE_FAILED_MESSAGE);
        setSaved(false);
        return;
      } finally {
        setSaving(false);
      }

      setStored(next);
      setError(null);
      setSaved(true);
      onSettingsChanged?.(next);

      const { at, day } = await loadToday();
      // The sync cancels what was pending and schedules what the new settings
      // make due — nothing at all, when they switched reminders off.
      void reminders?.sync(day, at);
    },
    [loadToday, onSettingsChanged, reminders, settings],
  );

  const toggleReminders = useCallback(() => {
    if (stored !== null) {
      void persist(createReminderSettings({ ...stored, enabled: !stored.enabled }));
    }
  }, [persist, stored]);

  /** The window as typed, or the message explaining why it is not one. */
  const typedWindow = useCallback((): QuietHours | string => {
    if (!isTimeOfDay(start) || !isTimeOfDay(end)) {
      return INVALID_TIME_MESSAGE;
    }

    const window = createQuietHours(start, end);

    // A window crossing midnight is accepted here; only one covering no time
    // at all is refused, because nobody means that by typing it.
    return isEmptyWindow(window) ? EMPTY_WINDOW_MESSAGE : window;
  }, [end, start]);

  const saveQuietHours = useCallback(() => {
    if (stored === null) {
      return;
    }

    const window = typedWindow();
    if (typeof window === 'string') {
      // Nothing is written: the only write is below this return, so a rejected
      // window cannot reach storage.
      setError(window);
      setSaved(false);
      return;
    }

    void persist(createReminderSettings({ ...stored, quietHours: window }));
  }, [persist, stored, typedWindow]);

  const toggleQuietHours = useCallback(() => {
    if (stored === null) {
      return;
    }

    if (stored.quietHours !== null) {
      void persist(createReminderSettings({ ...stored, quietHours: null }));
      return;
    }

    const window = typedWindow();
    // Switching quiet hours on with nothing usable typed falls back to the
    // suggested night window rather than refusing the press.
    void persist(
      createReminderSettings({
        ...stored,
        quietHours: typeof window === 'string' ? SUGGESTED_QUIET_HOURS : window,
      }),
    );
  }, [persist, stored, typedWindow]);

  const editStart = useCallback((next: string) => {
    setStart(next);
    // The message described what was in the field a moment ago, so it stops
    // being true as soon as the field changes.
    setError(null);
    setSaved(false);
  }, []);

  const editEnd = useCallback((next: string) => {
    setEnd(next);
    setError(null);
    setSaved(false);
  }, []);

  if (stored === null) {
    return (
      <View style={styles.screen}>
        <Text style={styles.heading}>Reminders</Text>
        <Text style={styles.loading}>{SETTINGS_LOADING_MESSAGE}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>Reminders</Text>

      <Switch
        name={REMINDERS_LABEL}
        on={stored.enabled}
        disabled={saving}
        onPress={toggleReminders}
      />

      {!stored.enabled && <Text style={styles.note}>{REMINDERS_OFF_MESSAGE}</Text>}

      <Text style={styles.summary}>{intervalSummary(stored.intervalMs)}</Text>

      <View style={styles.options}>
        {INTERVAL_OPTIONS_MS.map((ms) => {
          const chosen = ms === stored.intervalMs;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: saving, selected: chosen }}
              disabled={saving}
              key={ms}
              onPress={() => void persist(createReminderSettings({ ...stored, intervalMs: ms }))}
              style={[styles.option, chosen && styles.optionChosen]}
            >
              <Text style={chosen ? styles.optionLabelChosen : styles.optionLabel}>
                {intervalOptionLabel(ms)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.subheading}>Quiet hours</Text>

      <Switch
        name={QUIET_HOURS_LABEL}
        on={stored.quietHours !== null}
        disabled={saving}
        onPress={toggleQuietHours}
      />

      <Text style={styles.summary}>{quietHoursSummary(stored.quietHours)}</Text>

      <View style={styles.times}>
        <TextInput
          accessibilityLabel={QUIET_HOURS_START_LABEL}
          style={styles.input}
          value={start}
          onChangeText={editStart}
          placeholder="22:00"
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
        />
        <TextInput
          accessibilityLabel={QUIET_HOURS_END_LABEL}
          style={styles.input}
          value={end}
          onChangeText={editEnd}
          onSubmitEditing={saveQuietHours}
          placeholder="07:00"
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: saving }}
        disabled={saving}
        onPress={saveQuietHours}
        style={styles.button}
      >
        <Text style={styles.buttonLabel}>{SAVE_QUIET_HOURS_LABEL}</Text>
      </Pressable>

      {error !== null && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      {saved && error === null && <Text style={styles.saved}>{SETTINGS_SAVED_MESSAGE}</Text>}

      <Text style={styles.note}>
        Quiet hours may run through midnight — 22:00 to 07:00 is one quiet night, not an
        empty window.
      </Text>
    </View>
  );
}

interface SwitchProps {
  readonly name: string;
  readonly on: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}

/**
 * One on-off switch. Its state is part of its accessibility label as well as
 * its own line, so "on" is never read — or asserted on — without saying what
 * is on.
 */
function Switch({ name, on, disabled, onPress }: SwitchProps) {
  return (
    <Pressable
      accessibilityLabel={switchLabel(name, on)}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.switch}
    >
      <Text style={styles.switchName}>{name}</Text>
      <Text style={on ? styles.switchOn : styles.switchOff}>{on ? 'On' : 'Off'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 24,
    gap: 12,
  },
  heading: {
    fontSize: 28,
    fontWeight: '600',
  },
  subheading: {
    fontSize: 20,
    fontWeight: '600',
    paddingTop: 8,
  },
  loading: {
    fontSize: 16,
    color: '#555',
  },
  summary: {
    fontSize: 15,
    color: '#333',
  },
  switch: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderColor: '#b8c4cc',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  switchName: {
    fontSize: 16,
    color: '#26333d',
  },
  switchOn: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1b6b32',
  },
  switchOff: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    borderColor: '#b8c4cc',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  optionChosen: {
    backgroundColor: '#2b7fd4',
    borderColor: '#2b7fd4',
  },
  optionLabel: {
    fontSize: 15,
    color: '#26333d',
  },
  optionLabelChosen: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  times: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#b8c4cc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
  },
  button: {
    backgroundColor: '#2b7fd4',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#b00020',
    fontSize: 15,
  },
  saved: {
    color: '#1b6b32',
    fontSize: 15,
  },
  note: {
    color: '#555',
    fontSize: 13,
  },
});
