import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text } from 'react-native';

import { FirstRunGate } from './src/navigation';
import { createExpoReminderScheduler } from './src/notifications';
import { GoalScreen } from './src/screens';
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
 * What a launch opens on is `FirstRunGate`'s decision: onboarding until first
 * run has been recorded, and the app for ever after, per
 * docs/functional-spec.md, "First run".
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
        <GoalScreen storage={storage} />
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
