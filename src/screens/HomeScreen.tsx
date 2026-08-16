import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder home screen. TASK-001 only establishes the toolchain; the goal,
 * today's total and the blob arrive in later tasks.
 */
export default function HomeScreen() {
  return (
    <View style={styles.container} testID="home-screen">
      <Text style={styles.title}>Sip</Text>
      <Text style={styles.subtitle}>Drink some water.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e6f4fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: '#12384f',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#4a7c94',
  },
});
