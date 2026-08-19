import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text } from 'react-native';

import { GoalScreen } from './src/screens';
import { createAsyncStorageHydrationStorage } from './src/storage';

/**
 * The composition root: the one place that decides which implementation of the
 * storage interface the app runs on. Screens are handed it and never build
 * their own, which is what lets a test hand them the in-memory one instead —
 * see docs/architecture.md, "Why interfaces for storage and notifications".
 */
const storage = createAsyncStorageHydrationStorage();

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Sip</Text>
      <GoalScreen storage={storage} />
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
