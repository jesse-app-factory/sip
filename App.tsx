import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text } from 'react-native';

import { AppTabs, FirstRunGate } from './src/navigation';
import { createExpoReminderScheduler, createReminderService } from './src/notifications';
import {
  createAsyncStorageHydrationStorage,
  createAsyncStorageNotificationPermissionStorage,
  createAsyncStorageOnboardingStorage,
  createAsyncStorageReminderSettingsStorage,
} from './src/storage';

/**
 * The composition root: the one place that decides which implementation of the
 * storage and scheduling interfaces the app runs on. Screens are handed them
 * and never build their own, which is what lets a test hand them the in-memory
 * and fake ones instead — see docs/architecture.md, "Why interfaces for storage
 * and notifications".
 *
 * Built once at module scope rather than per render, so every screen shares one
 * store and one scheduler for the life of the process.
 */
const storage = createAsyncStorageHydrationStorage();
const onboarding = createAsyncStorageOnboardingStorage();
const settings = createAsyncStorageReminderSettingsStorage();
const permissions = createAsyncStorageNotificationPermissionStorage();
const scheduler = createExpoReminderScheduler();

/**
 * The one reminder service, built here for the same reason and shared for the
 * same reason.
 *
 * It is what holds the identifier of the single pending reminder, so a second
 * instance would be a second app's worth of state: switching reminders off on
 * the settings screen would cancel nothing, because the notification actually
 * pending would have been scheduled by the instance the today screen was
 * holding. docs/architecture.md, "Data flow, a reminder" — "At most one
 * reminder is pending at any moment" — is only true of a single service, so
 * there is exactly one and every screen is handed it.
 *
 * Constructed at app start rather than when a glass is first logged, because
 * opening the app is itself a moment the pending reminder is re-decided: the
 * today screen syncs against the day it reads, which is what schedules the
 * reminder due after the last glass of a day nothing has been logged against
 * since.
 */
const reminders = createReminderService({ scheduler, permissions, settings });

/**
 * What a launch opens on is `FirstRunGate`'s decision: onboarding until first
 * run has been recorded, and the app for ever after, per
 * docs/functional-spec.md, "First run". What the app *is* — today, history, the
 * goal and the reminder settings, each one tab away — is `AppTabs`'.
 */
export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Sip</Text>
      <FirstRunGate
        onboarding={onboarding}
        storage={storage}
        settings={settings}
        permissions={permissions}
        scheduler={scheduler}
      >
        <AppTabs storage={storage} settings={settings} reminders={reminders} />
      </FirstRunGate>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    paddingTop: 24,
    paddingHorizontal: 24,
  },
});
