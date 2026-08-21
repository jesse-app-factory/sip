/**
 * First run: an initial goal, a decision about notifications, and a way out of
 * both.
 *
 * docs/functional-spec.md, "First run": "On first launch the user is offered
 * onboarding: set an initial goal, and decide about notification permission.
 * Onboarding appears once. Completing it or skipping it both prevent it
 * appearing again. Skipping leaves a working app with a default goal of 2000 ml
 * and reminders switched off."
 *
 * ## Nothing here may strand the user
 *
 * An onboarding flow that can trap someone on its first screen is worse than no
 * onboarding at all, so every path out of this screen ends in the app:
 *
 * - Skipping is offered on both steps and never asks the platform anything.
 * - A rejected goal is reported on screen and writes nothing, exactly as on the
 *   goal screen; the user can correct it or skip.
 * - A goal that cannot be written leaves the user on the step with a message
 *   rather than half-way through a setup that did not happen.
 * - A permission prompt that throws is treated as unanswered rather than as a
 *   refusal, and onboarding still ends.
 * - A record of first run that cannot be written still ends onboarding. The
 *   cost is that it may appear once more on the next launch; the alternative is
 *   a user who cannot reach the app at all because storage misbehaved once.
 *
 * ## What each ending stores
 *
 * | Ending                      | Goal      | Reminders | Permission |
 * | --------------------------- | --------- | --------- | ---------- |
 * | Allowed, and granted        | as typed  | on        | granted    |
 * | Allowed, and refused        | as typed  | off       | denied     |
 * | Allowed, prompt unanswered  | as typed  | untouched | untouched  |
 * | Reminders declined here     | as typed  | off       | untouched  |
 * | Skipped                     | untouched | off       | untouched  |
 *
 * Skipping writes no goal because it does not need to: an absent goal reads
 * back as `DEFAULT_GOAL_ML`, which is the documented default in
 * `storage/records.ts` and the 2000 ml the specification asks for. Writing it
 * would record a choice the user declined to make.
 *
 * Declining reminders here records nothing about the platform's permission,
 * because the platform was never asked — the user said no to this app, not to
 * the operating system. Reminders being off is enough: nothing is scheduled,
 * so nothing prompts.
 *
 * ## The screen touches no platform API
 *
 * The goal goes through the storage interface, the prompt through the scheduler
 * interface, per docs/architecture.md. A screen without a scheduler simply has
 * nothing to prompt with and treats the answer as unanswered, which is what
 * lets the whole flow be rendered in a test.
 */
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { createGoal, DEFAULT_GOAL_ML } from '../domain';
// The pure settings module is imported directly rather than through
// `src/notifications`, whose barrel re-exports the device scheduler and would
// therefore load `expo-notifications` into this screen. The scheduler and the
// permission arrive as types, which are erased.
import type { NotificationPermission, ReminderScheduler } from '../notifications';
import { createReminderSettings } from '../notifications/settings';
import type {
  HydrationStorage,
  NotificationPermissionStorage,
  OnboardingOutcome,
  OnboardingStorage,
  ReminderSettingsStorage,
} from '../storage';
import { parseGoalInput } from './GoalScreen';

/** What the input is called to a screen reader, and to a test. */
export const ONBOARDING_GOAL_INPUT_LABEL = 'Initial daily goal in millilitres';

/** The headings of the two steps, and the welcome above them. */
export const ONBOARDING_TITLE = 'Welcome to Sip';
export const GOAL_STEP_HEADING = 'How much water a day?';
export const REMINDERS_STEP_HEADING = 'Shall we remind you?';

/** What the buttons are called. One press, one outcome. */
export const CONTINUE_LABEL = 'Continue';
export const ALLOW_REMINDERS_LABEL = 'Allow reminders';
export const DECLINE_REMINDERS_LABEL = 'No reminders';
export const SKIP_LABEL = 'Skip setup';

/** Shown when the goal could not be stored. Nothing moves on until it can. */
export const ONBOARDING_WRITE_FAILED_MESSAGE = 'That could not be saved. Please try again.';

/** What skipping leaves behind, said plainly before it is pressed. */
export const SKIP_NOTE = `Skip and Sip uses ${DEFAULT_GOAL_ML} ml a day with reminders off. You can change both later.`;

/** Which half of onboarding the user is on. */
type Step = 'goal' | 'reminders';

export interface OnboardingScreenProps {
  /** The persistence interface, for the initial goal. */
  readonly storage: HydrationStorage;
  /** Where the outcome of first run is recorded, so this appears once. */
  readonly onboarding: OnboardingStorage;
  /** Where reminders are switched off by skipping or declining. */
  readonly settings: ReminderSettingsStorage;
  /** Where the platform's answer about notifications is recorded. */
  readonly permissions: NotificationPermissionStorage;
  /**
   * What prompts for notification permission — the device one, or the fake. A
   * screen without one prompts nothing and behaves identically otherwise.
   */
  readonly scheduler?: ReminderScheduler;
  /** Told how onboarding ended, for whatever composes this. */
  readonly onFinished?: (outcome: OnboardingOutcome) => void;
}

export function OnboardingScreen({
  storage,
  onboarding,
  settings,
  permissions,
  scheduler,
  onFinished,
}: OnboardingScreenProps) {
  const [step, setStep] = useState<Step>('goal');
  const [text, setText] = useState(String(DEFAULT_GOAL_ML));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Stores whether reminders are on. A write that fails is swallowed: the
   * settings screen can still put it right, and neither a nuisance reminder nor
   * a missing one is worth keeping the user inside onboarding over.
   */
  const setReminders = useCallback(
    async (enabled: boolean): Promise<void> => {
      try {
        await settings.writeReminderSettings(createReminderSettings({ enabled }));
      } catch {
        // Reminders stay as they were, which is on by default.
      }
    },
    [settings],
  );

  /** Ends onboarding, recording how, and leaves the user in the app either way. */
  const finish = useCallback(
    async (outcome: OnboardingOutcome): Promise<void> => {
      try {
        await onboarding.writeOnboarding(outcome);
      } catch {
        // Onboarding may appear once more on the next launch. That is a far
        // smaller failure than refusing to let the user past this screen.
      }

      onFinished?.(outcome);
    },
    [onboarding, onFinished],
  );

  const skip = useCallback(async () => {
    setBusy(true);
    try {
      // No goal is written and the platform is not asked anything: skipping is
      // the user declining to answer, and the defaults are what answers for
      // them.
      await setReminders(false);
      await finish('skipped');
    } finally {
      setBusy(false);
    }
  }, [finish, setReminders]);

  const saveGoal = useCallback(async () => {
    const parsed = parseGoalInput(text);

    if ('message' in parsed) {
      // Nothing is written: the only write in this function is below this
      // return, so a rejected goal cannot reach storage.
      setError(parsed.message);
      return;
    }

    setBusy(true);
    try {
      await storage.writeGoal(createGoal(parsed.amountMl));
      setError(null);
      setStep('reminders');
    } catch {
      // The step does not advance, so the user is never told about reminders
      // for a goal that was never stored.
      setError(ONBOARDING_WRITE_FAILED_MESSAGE);
    } finally {
      setBusy(false);
    }
  }, [storage, text]);

  const allowReminders = useCallback(async () => {
    setBusy(true);
    try {
      let settled: NotificationPermission = 'undetermined';

      try {
        settled = (await scheduler?.requestPermission()) ?? 'undetermined';
      } catch {
        // A platform that refuses to prompt has told us nothing, so nothing is
        // recorded and the reminder service may ask again later.
        settled = 'undetermined';
      }

      if (settled !== 'undetermined') {
        try {
          // Recorded so the user is not asked again on every launch, per
          // docs/functional-spec.md, "Reminders".
          await permissions.writeNotificationPermission(settled);
        } catch {
          // They may be asked once more. Not a reason to hold up the app.
        }

        // A grant switches reminders on; a refusal switches them off, because
        // nothing can be scheduled and a switch reading "on" would be a lie.
        await setReminders(settled === 'granted');
      }

      await finish('completed');
    } finally {
      setBusy(false);
    }
  }, [finish, permissions, scheduler, setReminders]);

  const declineReminders = useCallback(async () => {
    setBusy(true);
    try {
      await setReminders(false);
      await finish('completed');
    } finally {
      setBusy(false);
    }
  }, [finish, setReminders]);

  const edit = useCallback((next: string) => {
    setText(next);
    // The message described what was in the field a moment ago, so it stops
    // being true as soon as the field changes.
    setError(null);
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>{ONBOARDING_TITLE}</Text>

      {step === 'goal' ? (
        <View style={styles.step}>
          <Text style={styles.subheading}>{GOAL_STEP_HEADING}</Text>
          <Text style={styles.body}>
            Sip counts what you drink against this, and you can change it whenever you
            like.
          </Text>

          <TextInput
            accessibilityLabel={ONBOARDING_GOAL_INPUT_LABEL}
            style={styles.input}
            value={text}
            onChangeText={edit}
            onSubmitEditing={() => void saveGoal()}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder={String(DEFAULT_GOAL_ML)}
            returnKeyType="done"
          />

          <Action label={CONTINUE_LABEL} disabled={busy} onPress={() => void saveGoal()} />
        </View>
      ) : (
        <View style={styles.step}>
          <Text style={styles.subheading}>{REMINDERS_STEP_HEADING}</Text>
          <Text style={styles.body}>
            A reminder is a notification on this device when you have not logged a glass
            for a while. Nothing leaves your phone.
          </Text>

          <Action
            label={ALLOW_REMINDERS_LABEL}
            disabled={busy}
            onPress={() => void allowReminders()}
          />
          <Action
            label={DECLINE_REMINDERS_LABEL}
            disabled={busy}
            onPress={() => void declineReminders()}
            secondary
          />
        </View>
      )}

      {error !== null && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => void skip()}
        style={styles.skip}
      >
        <Text style={styles.skipLabel}>{SKIP_LABEL}</Text>
      </Pressable>

      <Text style={styles.note}>{SKIP_NOTE}</Text>
    </View>
  );
}

interface ActionProps {
  readonly label: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly secondary?: boolean;
}

/** One button, named by what it does, so pressing and asserting name the same thing. */
function Action({ label, disabled, onPress, secondary = false }: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={secondary ? styles.secondaryButton : styles.button}
    >
      <Text style={secondary ? styles.secondaryButtonLabel : styles.buttonLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 24,
    gap: 12,
  },
  step: {
    gap: 12,
  },
  heading: {
    fontSize: 28,
    fontWeight: '600',
  },
  subheading: {
    fontSize: 20,
    fontWeight: '600',
  },
  body: {
    fontSize: 15,
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
  secondaryButton: {
    borderColor: '#b8c4cc',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonLabel: {
    color: '#26333d',
    fontSize: 16,
    fontWeight: '600',
  },
  skip: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  skipLabel: {
    color: '#2b7fd4',
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    color: '#b00020',
    fontSize: 15,
  },
  note: {
    color: '#555',
    fontSize: 13,
  },
});
