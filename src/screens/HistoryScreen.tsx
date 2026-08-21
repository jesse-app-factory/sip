/**
 * History: the last seven days, and the streak they end.
 *
 * The screen decides nothing about hydration. Which days to read is
 * `readHistory`'s business and whether a day counted is `domain/history.ts`'s,
 * so what is left here is arranging seven already-judged days on screen — the
 * same division as every other screen, per docs/architecture.md.
 *
 * ## Each day against its own goal
 *
 * docs/functional-spec.md, "History": the last seven days are shown "each with
 * its total and the goal that applied on that day". The goal in each row is
 * the one stored with that day, so raising today's goal changes today's row and
 * nothing above it. Today's goal is never read here at all.
 *
 * ## A day with no data
 *
 * A date nothing was stored under is still one of the seven. It is shown as
 * having nothing logged, with no goal, because there was no goal that day —
 * printing today's would invent the standard it was judged against. It counts
 * as not met, and so breaks the streak rather than being skipped.
 *
 * ## Time
 *
 * The current moment arrives as a prop rather than from the clock, per
 * docs/technical-spec.md, "Time", so a test decides which day is today. For
 * the app left open across midnight the date is rechecked on the same interval
 * the Today screen uses, and history is read again for the new day.
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { assertLocalDate, HistoryDay, LocalDate, toLocalDate } from '../domain';
import type { History, HydrationStorage } from '../storage';
// Imported directly rather than through `src/storage`, whose barrel re-exports
// the device store and would therefore load AsyncStorage into this screen. The
// storage and the history it returns arrive as types, which are erased.
import { readHistory } from '../storage/history';
import { DATE_CHECK_INTERVAL_MS } from './TodayScreen';

/** Shown until history has been read back from storage. */
export const HISTORY_LOADING_MESSAGE = 'Reading your history…';

/** Shown for a day nothing is stored for, and for one with no glasses logged. */
export const NOTHING_LOGGED_MESSAGE = 'Nothing logged';

/** Shown once, when none of the seven days has anything recorded against it. */
export const EMPTY_HISTORY_MESSAGE = 'Nothing logged in the last seven days yet.';

/** How a day that reached its goal is marked, to a reader and to a test. */
export const DAY_MET_MARK = 'Goal met';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * A date as a row is headed: "Tue 18 Aug".
 *
 * Built from the parts of the local date with names of its own rather than
 * through `toLocaleDateString`, whose output depends on the locale of the
 * machine it runs on — which in a test is not the user's.
 */
export function formatHistoryDate(date: LocalDate): string {
  assertLocalDate(date, 'A history date');

  const [year, month, dayOfMonth] = date.split('-').map(Number);
  // Local midnight, so the weekday is the one the user's calendar shows.
  const weekday = WEEKDAYS[new Date(year, month - 1, dayOfMonth).getDay()];

  return `${weekday} ${dayOfMonth} ${MONTHS[month - 1]}`;
}

/** What a day amounts to: its total against the goal that applied that day. */
export function historyDayAmount(day: HistoryDay): string {
  return day.recorded ? `${day.totalMl} ml of ${day.goalMl} ml` : NOTHING_LOGGED_MESSAGE;
}

/**
 * How one row reads to a screen reader, and to a test: the date, the figures
 * and the verdict as one label, so no amount is ever read without the day it
 * belongs to.
 */
export function historyDayLabel(day: HistoryDay): string {
  return `${formatHistoryDate(day.date)}: ${historyDayAmount(day)}, ${
    day.met ? 'goal met' : 'goal not met'
  }`;
}

/**
 * How the streak reads. Zero is a sentence rather than the number 0, because
 * "Current streak: 0 days" is a worse way of saying nobody has started one.
 */
export function streakSummary(streak: number): string {
  if (streak === 0) {
    return 'No streak yet. Meet the goal today to start one.';
  }

  return `Current streak: ${streak} ${streak === 1 ? 'day' : 'days'}`;
}

/**
 * Hoisted so that a screen rendered without a clock keeps the same one across
 * renders, which is what stops the date check resubscribing on every render.
 */
const systemClock = (): Date => new Date();

export interface HistoryScreenProps {
  /** The persistence interface from TASK-003 — the device one, or the fake. */
  readonly storage: HydrationStorage;
  /** The current moment, injected so tests decide which day is today. */
  readonly now?: () => Date;
}

export function HistoryScreen({ storage, now = systemClock }: HistoryScreenProps) {
  const [today, setToday] = useState<LocalDate>(() => toLocalDate(now(), 'Today'));
  const [history, setHistory] = useState<History | null>(null);

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

    // Reading history never rejects: a date holding nothing readable comes
    // back as a day with no data, so there is no failure branch to render.
    readHistory(storage, today).then((read) => {
      if (active) {
        setHistory(read);
      }
    });

    return () => {
      active = false;
    };
  }, [storage, today]);

  if (history === null) {
    return (
      <View style={styles.screen}>
        <Text style={styles.heading}>History</Text>
        <Text style={styles.loading}>{HISTORY_LOADING_MESSAGE}</Text>
      </View>
    );
  }

  const recorded = history.days.filter((day) => day.recorded).length;

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>History</Text>

      <Text style={styles.streak}>{streakSummary(history.streak)}</Text>

      {recorded === 0 && <Text style={styles.empty}>{EMPTY_HISTORY_MESSAGE}</Text>}

      {/* Scrollable rather than a list component: seven rows is a fixed, tiny
          number, and the whole of it is meant to be readable at a glance. */}
      <ScrollView>
        {history.days.map((day) => (
          <View
            accessible
            accessibilityLabel={historyDayLabel(day)}
            key={day.date}
            style={styles.row}
          >
            <Text style={styles.rowDate}>{formatHistoryDate(day.date)}</Text>
            <Text style={day.recorded ? styles.rowAmount : styles.rowNothing}>
              {historyDayAmount(day)}
            </Text>
            {day.met && <Text style={styles.rowMet}>{DAY_MET_MARK}</Text>}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

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
  streak: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1b6b32',
  },
  empty: {
    fontSize: 15,
    color: '#555',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    paddingVertical: 10,
    borderBottomColor: '#e2e8ec',
    borderBottomWidth: 1,
  },
  rowDate: {
    fontSize: 15,
    fontWeight: '600',
    width: 96,
  },
  rowAmount: {
    fontSize: 15,
    flexGrow: 1,
  },
  rowNothing: {
    fontSize: 15,
    flexGrow: 1,
    color: '#555',
  },
  rowMet: {
    fontSize: 13,
    color: '#1b6b32',
  },
});
