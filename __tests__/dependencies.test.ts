/**
 * The four feature dependencies later tasks build on, imported once so a broken
 * or missing install fails here rather than in the task that first needs it.
 *
 * Nothing here calls a platform API: AsyncStorage is not read or written and no
 * notification is scheduled, per docs/testing-strategy.md. Only that each module
 * loads and exposes the entry point the app will use is asserted.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Animated, { useSharedValue, withTiming } from 'react-native-reanimated';
import { Svg, Circle } from 'react-native-svg';

describe('feature dependencies', () => {
  it('loads @react-native-async-storage/async-storage', () => {
    expect(typeof AsyncStorage.getItem).toBe('function');
    expect(typeof AsyncStorage.setItem).toBe('function');
  });

  it('loads expo-notifications', () => {
    expect(typeof Notifications.scheduleNotificationAsync).toBe('function');
    expect(typeof Notifications.getPermissionsAsync).toBe('function');
  });

  it('loads react-native-reanimated', () => {
    expect(Animated.View).toBeDefined();
    expect(typeof useSharedValue).toBe('function');
    expect(typeof withTiming).toBe('function');
  });

  it('loads react-native-svg', () => {
    expect(Svg).toBeDefined();
    expect(Circle).toBeDefined();
  });
});
