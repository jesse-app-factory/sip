/**
 * The main screen: log a glass, see where the day stands, undo a mistake.
 *
 * This is the screen the user opens ten times a day, so the whole of logging
 * is one press on a size. Everything the screen knows about totals, remaining
 * amounts and the day boundary comes from `domain/`, and everything it
 * persists goes through the storage interface it is handed — it never touches
 * AsyncStorage, per docs/architecture.md.
 *
 * ## Persisting before the interaction completes
 *
 * docs/functional-spec.md, "Logging": "Logging is one interaction and is
 * persisted before that interaction completes. An entry that exists on screen
 * but not in storage is a defect."
 *
 * So the order is the one docs/architecture.md, "Data flow, logging a glass"
 * sets out: build the new day with the domain function, write it and *wait*,
 * and only then show it. A total that has appeared on screen has already been
 * stored; a write that fails leaves the total where it was and says so.
 *
 * Presses are queued rather than dropped, so tapping twice quickly logs two
 * glasses. Each queued change reads the day the previous one produced, which
 * is what stops the second tap from overwriting the first with a day it read
 * before that first write landed.
 *
 * ## The day boundary
 *
 * The local date is read from the injected clock at the moment of the tap, so
 * a glass logged a second after midnight is logged against the new day rather
 * than the one that happens to be on screen. For the app left open across
 * midnight, the date is also rechecked every `DATE_CHECK_INTERVAL_MS`.
 *
 * Either way the new day is a *different key* in storage — see
 * docs/architecture.md, "Storage layout" — so yesterday is retained with its
 * entries and the goal it was judged against, untouched.
 *
 * A day that has never been written is held in memory only until something is
 * logged against it. "No data for this date" and "a date on which nothing was
 * drunk" are different facts to history, per `storage/records.ts`, and logging
 * the first glass is what turns today into the second one.
 *
 * ## Time
 *
 * The current moment arrives as a prop rather than from the clock, per
 * docs/technical-spec.md, "Time", so a test can move the day forward instead
 * of waiting until midnight.
 *
 * ## The blob
 *
 * docs/architecture.md, "Data flow, logging a glass", step 4: the screen
 * "recomputes progress and passes it to the blob, which animates". Progress is
 * the domain's `progress`, so the blob is shown the same figure the stats are,
 * and the animation is the blob's own business — logging never waits for it,
 * and nothing here is disabled while it runs.
 *
 * ## Reminders
 *
 * Step 5 of the same data flow: the screen "cancels the pending reminder and
 * schedules the next through the notification interface". That is one call —
 * `sync` — because cancelling and rescheduling are one decision, and it is
 * made after the write rather than before it, so a reminder is never moved on
 * the strength of a glass that failed to save.
 *
 * The day as it now stands is what `sync` is given, so whether the goal has
 * been met and when the last glass was logged are read from the same value the
 * screen is showing. Whether that means scheduling anything at all is the
 * service's decision, not this screen's.
 *
 * Nothing here waits for it. Logging is finished once the day is stored and on
 * screen; a slow or refused notification call must not hold up the next glass,
 * and the service never rejects, so there is nothing to catch.
 *
 * The screen is handed the service the same way it is handed its storage, and
 * works without one — a screen rendered with no reminders simply schedules
 * none.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimatedBlob, BlobMood, useReduceMotion } from '../components';
import {
  addEntry,
  createDay,
  createEntry,
  Day,
  isGoalMet,
  lastEntry,
  LocalDate,
  progress,
  remainingMl,
  toLocalDate,
  totalMl,
  undoLastEntry,
} from '../domain';
import type { ReminderService } from '../notifications';
import type { HydrationStorage } from '../storage';

/**
 * The glass sizes offered, in millilitres. Which sizes to offer is a question
 * about the screen rather than about hydration, so it is decided here; what
 * counts as a valid amount is still the domain's one definition, because every
 * one of these goes through `createEntry`.
 */
export const GLASS_SIZES_ML: readonly number[] = [200, 250, 330, 500];

/** How often the app, left open, rechecks whether the local date has changed. */
export const DATE_CHECK_INTERVAL_MS = 30_000;

/** The three figures the day is judged by. Exported so tests name what users read. */
export const TOTAL_LABEL = 'Logged today';
export const GOAL_LABEL = 'Daily goal';
export const REMAINING_LABEL = 'Remaining';

/** Shown instead of a remaining amount once the goal has been reached. */
export const GOAL_MET_MESSAGE = 'Goal met. Nice work.';

/** What undo is called to a screen reader, and to a test. */
export const UNDO_LABEL = 'Undo last glass';

/** Shown when storage refused a write, so no unstored glass is left on screen. */
export const WRITE_FAILED_MESSAGE = 'That could not be saved. Please try again.';

/** Shown until the day has been read back from storage. */
export const LOADING_MESSAGE = 'Reading today…';

/**
 * The mood the blob is shown in on this screen.
 *
 * Constant, because nothing on this screen knows how to choose between the
 * moods: whether a drink is overdue is a question about the reminder interval
 * and whether it is the middle of the night is a question about quiet hours,
 * and this screen is handed neither — both are settings, and the reminder
 * service is what reads them. Happiness is not a mood — the blob derives that
 * from progress alone, per `BlobMood`.
 */
export const BLOB_MOOD: BlobMood = 'calm';

/** What one glass button is called: one press, one glass, no further choices. */
export function glassButtonLabel(amountMl: number): string {
  return `Log ${amountMl} ml`;
}

/** How a figure and its label read together, to a screen reader and to a test. */
export function statLabel(label: string, amountMl: number): string {
  return `${label}: ${amountMl} ml`;
}

/**
 * Hoisted so that a screen rendered without a clock keeps the same one across
 * renders, which is what stops the date check resubscribing on every render.
 */
const systemClock = (): Date => new Date();

export interface TodayScreenProps {
  /** The persistence interface from TASK-003 — the device one, or the fake. */
  readonly storage: HydrationStorage;
  /** The current moment, injected so tests decide which day is today. */
  readonly now?: () => Date;
  /** Told about every day that reached storage, for whatever composes this. */
  readonly onDayChanged?: (day: Day) => void;
  /**
   * The reminder scheduling from TASK-008 — the device one, or the fake. A
   * screen without one schedules nothing and behaves identically otherwise.
   */
  readonly reminders?: ReminderService;
}

export function TodayScreen({
  storage,
  now = systemClock,
  onDayChanged,
  reminders,
}: TodayScreenProps) {
  const [today, setToday] = useState<LocalDate>(() => toLocalDate(now(), 'Today'));
  const [day, setDay] = useState<Day | null>(null);
  const [failed, setFailed] = useState(false);
  const reduceMotion = useReduceMotion();

  // The day as of the last write, read by the next queued change. State cannot
  // serve here: a second press in the same tick would still see the first
  // press's starting value and undo it.
  const current = useRef<Day | null>(null);
  const pending = useRef<Promise<unknown>>(Promise.resolve());

  const loadDay = useCallback(
    async (date: LocalDate): Promise<Day> =>
      // Storage never rejects a read: an absent or unreadable day comes back as
      // `null` and an unreadable goal as the default, so there is no failure
      // branch here. A day not yet in storage carries the goal in force now.
      (await storage.readDay(date)) ?? createDay(date, await storage.readGoal()),
    [storage],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      // Same date means the same string, so this re-renders nothing until the
      // day actually turns over.
      setToday(toLocalDate(now(), 'Today'));
    }, DATE_CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [now]);

  useEffect(() => {
    let active = true;

    if (current.current !== null && current.current.date !== today) {
      // Midnight has passed. Yesterday's total stops being what today is,
      // before the new day has finished loading.
      current.current = null;
      setDay(null);
    }

    loadDay(today).then((loaded) => {
      // A glass logged while this read was in flight has already produced a
      // newer day for this date, and it is the one that is stored.
      if (active && current.current === null) {
        current.current = loaded;
        setDay(loaded);
        // The app being opened is when the reminder for a day nothing has been
        // logged against since is due — the interval runs from the last glass,
        // whenever that was, rather than from this launch.
        void reminders?.sync(loaded, now());
      }
    });

    return () => {
      active = false;
    };
  }, [loadDay, now, reminders, today]);

  /**
   * Applies a change to the day the previous change left behind, writes it,
   * and only then shows it. Returning `null` from `change` means there was
   * nothing to do, and writes nothing.
   */
  const mutate = useCallback(
    (change: (day: Day, at: Date) => Day | null): Promise<void> => {
      const run = pending.current.then(async () => {
        const at = now();
        const date = toLocalDate(at, 'Today');
        const before =
          current.current !== null && current.current.date === date
            ? current.current
            : await loadDay(date);

        const after = change(before, at);
        if (after === null) {
          return;
        }

        try {
          await storage.writeDay(after);
        } catch {
          // Nothing below this ran, so the total on screen still matches what
          // is stored rather than showing a glass that was never saved.
          setFailed(true);
          return;
        }

        current.current = after;
        setFailed(false);
        // Keeps the heading on the right date when the tap itself crossed
        // midnight; an unchanged date re-renders nothing.
        setToday(date);
        setDay(after);
        onDayChanged?.(after);
        // Not awaited: the glass is logged, and the reminder that follows from
        // it is the notification system's business rather than something the
        // next tap should queue behind.
        void reminders?.sync(after, at);
      });

      // The queue survives a failed change, so one refused write does not stop
      // every later glass from being logged.
      pending.current = run.catch(() => undefined);

      return run;
    },
    [loadDay, now, onDayChanged, reminders, storage],
  );

  const logGlass = useCallback(
    (amountMl: number): Promise<void> =>
      mutate((currentDay, at) => addEntry(currentDay, createEntry(amountMl, at))),
    [mutate],
  );

  const undo = useCallback(
    (): Promise<void> =>
      // Undo on a day with no entries does nothing and raises no error, per
      // docs/functional-spec.md, "Logging".
      mutate((currentDay) =>
        lastEntry(currentDay) === null ? null : undoLastEntry(currentDay),
      ),
    [mutate],
  );

  const canUndo = day !== null && lastEntry(day) !== null;

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>Today</Text>

      {day === null ? (
        <Text style={styles.loading}>{LOADING_MESSAGE}</Text>
      ) : (
        <View style={styles.blob}>
          {/* Mounted with the day rather than before it, so the blob's first
              size is the size today has earned rather than an empty blob that
              then grows to it. */}
          <AnimatedBlob
            mood={BLOB_MOOD}
            progress={progress(day)}
            reduceMotion={reduceMotion}
          />
        </View>
      )}

      {day !== null && (
        <View style={styles.stats}>
          <Stat label={TOTAL_LABEL} amountMl={totalMl(day)} emphasised />
          <Stat label={GOAL_LABEL} amountMl={day.goal.amountMl} />
          <Stat label={REMAINING_LABEL} amountMl={remainingMl(day)} />
          {isGoalMet(day) && <Text style={styles.met}>{GOAL_MET_MESSAGE}</Text>}
        </View>
      )}

      <View style={styles.glasses}>
        {GLASS_SIZES_ML.map((amountMl) => (
          <Pressable
            accessibilityRole="button"
            key={amountMl}
            onPress={() => logGlass(amountMl)}
            style={styles.glass}
          >
            <Text style={styles.glassLabel}>{glassButtonLabel(amountMl)}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canUndo }}
        disabled={!canUndo}
        onPress={undo}
        style={[styles.undo, !canUndo && styles.undoDisabled]}
      >
        <Text style={styles.undoLabel}>{UNDO_LABEL}</Text>
      </Pressable>

      {failed && (
        <Text accessibilityRole="alert" style={styles.error}>
          {WRITE_FAILED_MESSAGE}
        </Text>
      )}
    </View>
  );
}

interface StatProps {
  readonly label: string;
  readonly amountMl: number;
  readonly emphasised?: boolean;
}

/**
 * One of the three figures. The label and the amount are one accessibility
 * label as well as two lines, so that "750 ml" is never read — or asserted on
 * — without saying which of the three it is.
 */
function Stat({ label, amountMl, emphasised = false }: StatProps) {
  return (
    <View accessible accessibilityLabel={statLabel(label, amountMl)} style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={emphasised ? styles.statValueLarge : styles.statValue}>
        {amountMl} ml
      </Text>
    </View>
  );
}

// A plain `View`, deliberately: the total, the goal and the remaining amount
// are all visible at once rather than something to scroll to.
const styles = StyleSheet.create({
  screen: {
    padding: 24,
    gap: 16,
  },
  heading: {
    fontSize: 28,
    fontWeight: '600',
  },
  loading: {
    fontSize: 16,
    color: '#555',
  },
  blob: {
    alignItems: 'center',
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'flex-end',
  },
  stat: {
    gap: 2,
  },
  statLabel: {
    fontSize: 13,
    color: '#555',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  statValueLarge: {
    fontSize: 32,
    fontWeight: '700',
  },
  met: {
    color: '#1b6b32',
    fontSize: 15,
  },
  glasses: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  glass: {
    backgroundColor: '#2b7fd4',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  glassLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  undo: {
    borderColor: '#b8c4cc',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  undoDisabled: {
    opacity: 0.4,
  },
  undoLabel: {
    fontSize: 16,
    color: '#26333d',
  },
  error: {
    color: '#b00020',
    fontSize: 15,
  },
});
