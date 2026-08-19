/**
 * Setting the daily goal, and changing it part-way through a day.
 *
 * The screen owns two things and nothing else: turning what was typed into a
 * number, and moving a valid goal through the storage interface. Every rule
 * about what a goal *is* lives in `domain/`, and every rule about how it is
 * stored lives in `storage/` — this file reaches both through their
 * interfaces and never touches AsyncStorage, per docs/architecture.md.
 *
 * ## Changing the goal leaves the day alone
 *
 * docs/functional-spec.md, "The daily goal": "Changing the goal does not
 * change anything already logged. The two are independent records: entries are
 * what happened, the goal is what was intended."
 *
 * Saving therefore writes the goal key, and then — only if a day has already
 * been recorded for today — rewrites that day through `withGoal`, which
 * returns a new day carrying the same entries. Today's record is rewritten
 * because a goal set today is the goal today is judged against; no other day
 * is read or written, so "each day retains the goal that applied on that day"
 * holds for every day already in history.
 *
 * A day that does not exist yet is not created here. "No data for this date"
 * and "a date on which nothing was drunk" are different facts to history — see
 * `storage/records.ts` — and logging the first glass is what makes today the
 * second one.
 *
 * ## Time
 *
 * The current moment arrives as a prop rather than from the clock, per
 * docs/technical-spec.md, "Time", so a test can decide which day "today" is
 * instead of depending on when it runs.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { createGoal, Goal, toLocalDate, withGoal } from '../domain';
import type { HydrationStorage } from '../storage';

/** What the input is called to a screen reader, and to a test. */
export const GOAL_INPUT_LABEL = 'Daily goal in millilitres';

/** Rejection messages. Exported so a test names the same string the user sees. */
export const EMPTY_GOAL_MESSAGE = 'Enter a goal in millilitres.';
export const NOT_A_NUMBER_MESSAGE = 'A goal must be a number, for example 2000.';
export const NOT_WHOLE_MESSAGE = 'A goal must be a whole number of millilitres.';
export const NOT_POSITIVE_MESSAGE = 'A goal must be greater than zero.';

/** Confirmation shown once a goal has reached storage. */
export const SAVED_MESSAGE = 'Goal saved.';

/**
 * Digits, with an optional sign and decimal part, and nothing else. Deliberately
 * narrower than `Number`, which reads `"0x10"` as 16 and `"1e3"` as 1000 —
 * neither is something a person means to type into a millilitres field, and
 * silently accepting them would store a goal nobody asked for.
 */
const NUMERIC = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/** A parsed amount, or the reason the text was rejected. */
export type ParsedGoal = { readonly amountMl: number } | { readonly message: string };

/**
 * Turns what was typed into an amount in millilitres, or into the message
 * explaining why it is not one.
 *
 * Text is a UI concern, so it is decided here; the amount it produces is still
 * handed to `createGoal`, so nothing reaches storage without going through the
 * domain's one definition of a valid amount.
 */
export function parseGoalInput(raw: string): ParsedGoal {
  const text = raw.trim();

  if (text === '') {
    return { message: EMPTY_GOAL_MESSAGE };
  }

  if (!NUMERIC.test(text)) {
    return { message: NOT_A_NUMBER_MESSAGE };
  }

  const value = Number(text);

  if (!Number.isInteger(value)) {
    return { message: NOT_WHOLE_MESSAGE };
  }

  if (value <= 0) {
    return { message: NOT_POSITIVE_MESSAGE };
  }

  return { amountMl: value };
}

export interface GoalScreenProps {
  /** The persistence interface from TASK-003 — the device one, or the fake. */
  readonly storage: HydrationStorage;
  /** The current moment, injected so tests decide which day is today. */
  readonly now?: () => Date;
  /** Told about every goal that reached storage, for whatever composes this. */
  readonly onGoalSaved?: (goal: Goal) => void;
}

export function GoalScreen({
  storage,
  now = () => new Date(),
  onGoalSaved,
}: GoalScreenProps) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Storage never rejects a read: an absent or unreadable goal comes back as
    // the default, so there is no failure branch to render here.
    let current = true;

    storage.readGoal().then((stored) => {
      if (current) {
        setGoal(stored);
        setText(String(stored.amountMl));
      }
    });

    return () => {
      current = false;
    };
  }, [storage]);

  const edit = useCallback((next: string) => {
    setText(next);
    // The message described what was in the field a moment ago, so it stops
    // being true as soon as the field changes.
    setError(null);
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    const parsed = parseGoalInput(text);

    if ('message' in parsed) {
      // Nothing is written: the only writes in this function are below this
      // return, so a rejected goal cannot reach storage.
      setError(parsed.message);
      setSaved(false);
      return;
    }

    const next = createGoal(parsed.amountMl);

    setSaving(true);
    try {
      await storage.writeGoal(next);

      const today = toLocalDate(now(), 'Today');
      const day = await storage.readDay(today);
      if (day !== null) {
        await storage.writeDay(withGoal(day, next));
      }

      setGoal(next);
      setText(String(next.amountMl));
      setError(null);
      setSaved(true);
      onGoalSaved?.(next);
    } finally {
      setSaving(false);
    }
  }, [now, onGoalSaved, storage, text]);

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>Daily goal</Text>

      <Text style={styles.current}>
        {goal === null ? 'Reading your goal…' : `Currently ${goal.amountMl} ml a day`}
      </Text>

      <TextInput
        accessibilityLabel={GOAL_INPUT_LABEL}
        style={styles.input}
        value={text}
        onChangeText={edit}
        onSubmitEditing={save}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder="2000"
        returnKeyType="done"
      />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: saving }}
        disabled={saving}
        onPress={save}
        style={styles.button}
      >
        <Text style={styles.buttonLabel}>Save goal</Text>
      </Pressable>

      {error !== null && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      {saved && error === null && <Text style={styles.saved}>{SAVED_MESSAGE}</Text>}

      <Text style={styles.note}>
        Changing your goal never changes what you have already logged today.
      </Text>
    </View>
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
  current: {
    fontSize: 16,
    color: '#333',
  },
  input: {
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
