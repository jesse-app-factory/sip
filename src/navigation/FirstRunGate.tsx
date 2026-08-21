/**
 * Which screen a launch opens on: onboarding, or the app.
 *
 * docs/functional-spec.md, "First run": onboarding "appears once. Completing it
 * or skipping it both prevent it appearing again." That is a decision about
 * wiring rather than about either screen, so it lives here in `navigation/`
 * rather than inside `OnboardingScreen`, which knows how to run first run but
 * not whether it should — see docs/technical-spec.md, "Structure".
 *
 * The rule is the whole file: onboarding shows while the record of first run is
 * `'pending'`, and the app shows for either recorded outcome. Because the
 * record is read from storage on every launch and written before onboarding
 * ends, "does not appear again" needs nothing remembered in memory and survives
 * the process being killed.
 *
 * ## Nothing here may strand the user either
 *
 * The app is not rendered until the record has been read, so a returning user
 * never sees onboarding flash past on the way to the app. That makes the read a
 * gate, and a gate that never opens is a blank app — so a read that rejects is
 * treated as `'pending'` rather than left hanging. Onboarding is always
 * skippable, so the worst that a failed read can cost is one screen.
 */
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ReminderScheduler } from '../notifications';
import { OnboardingScreen } from '../screens';
import type {
  HydrationStorage,
  NotificationPermissionStorage,
  OnboardingState,
  OnboardingStorage,
  ReminderSettingsStorage,
} from '../storage';

/** Shown for the moment it takes to read whether this is first run. */
export const FIRST_RUN_LOADING_MESSAGE = 'Starting Sip…';

export interface FirstRunGateProps {
  /** Where the outcome of first run is recorded — the device one, or the fake. */
  readonly onboarding: OnboardingStorage;
  /** The persistence interface, handed to onboarding for the initial goal. */
  readonly storage: HydrationStorage;
  /** Where reminders are switched off by skipping or declining. */
  readonly settings: ReminderSettingsStorage;
  /** Where the platform's answer about notifications is recorded. */
  readonly permissions: NotificationPermissionStorage;
  /** What prompts for permission. Onboarding without one prompts nothing. */
  readonly scheduler?: ReminderScheduler;
  /** The app itself, shown once first run is behind the user. */
  readonly children: ReactNode;
}

export function FirstRunGate({
  onboarding,
  storage,
  settings,
  permissions,
  scheduler,
  children,
}: FirstRunGateProps) {
  const [state, setState] = useState<OnboardingState | null>(null);

  useEffect(() => {
    let current = true;

    onboarding
      .readOnboarding()
      // An unreadable record already reads back as `'pending'`; this catch is
      // for the store itself failing, where the alternative is a launch that
      // renders nothing at all for ever.
      .catch((): OnboardingState => 'pending')
      .then((read) => {
        if (current) {
          setState(read);
        }
      });

    return () => {
      current = false;
    };
  }, [onboarding]);

  // Recorded by onboarding before this runs, so this only moves the screen the
  // user is looking at; the next launch reads the same answer from storage.
  const finished = useCallback((outcome: OnboardingState) => {
    setState(outcome);
  }, []);

  if (state === null) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingLabel}>{FIRST_RUN_LOADING_MESSAGE}</Text>
      </View>
    );
  }

  if (state === 'pending') {
    return (
      <OnboardingScreen
        storage={storage}
        onboarding={onboarding}
        settings={settings}
        permissions={permissions}
        scheduler={scheduler}
        onFinished={finished}
      />
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    padding: 24,
  },
  loadingLabel: {
    fontSize: 16,
    color: '#555',
  },
});
