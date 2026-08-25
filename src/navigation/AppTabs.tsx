/**
 * The app once first run is behind the user: the four screens, and how a phone
 * gets between them.
 *
 * `FirstRunGate` decides *whether* the app or onboarding is shown; this decides
 * *which screen* of the app is. Both are wiring rather than behaviour, so both
 * live in `navigation/` per docs/technical-spec.md, "Structure", and neither
 * screen below knows it is inside a navigator.
 *
 * Bottom tabs rather than a stack because the four screens are peers: none of
 * them is reached "through" another, and docs/acceptance-criteria.md asks for
 * today's total, the history and the reminder settings to each be somewhere the
 * user can simply go. Today is the initial route because logging a glass is the
 * one thing the product exists to make quick.
 *
 * Every screen still receives its storage and its scheduling through props, so
 * nothing here weakens what makes them testable: this file hands on what the
 * composition root built and adds no implementation of its own.
 *
 * ## Why the screens are remounted rather than left alone
 *
 * A tab that has been visited stays mounted, and both `TodayScreen` and
 * `HistoryScreen` read what they show once, when they mount. Left alone, a
 * glass logged on Today would leave History showing the totals that were true
 * when its tab was first opened, and a goal changed on Goal would leave Today
 * judging the day against the old one.
 *
 * So the two screens that write tell this component, and their keys carry the
 * count: a write remounts whichever screens that write invalidated, and they
 * re-read from storage — which is the one place that knows the truth. Today is
 * deliberately *not* remounted by its own writes, because it already shows what
 * it wrote and a remount would restart the blob's animation.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import type { ReminderService } from '../notifications';
import { GoalScreen, HistoryScreen, SettingsScreen, TodayScreen } from '../screens';
import type { HydrationStorage, ReminderSettingsStorage } from '../storage';

/** The route names, exported so a test names a tab the way the app does. */
export const TODAY_TAB = 'Today';
export const HISTORY_TAB = 'History';
export const GOAL_TAB = 'Goal';
export const SETTINGS_TAB = 'Settings';

export type AppTabsParamList = {
  Today: undefined;
  History: undefined;
  Goal: undefined;
  Settings: undefined;
};

export type AppTabName = keyof AppTabsParamList;

/** The four tabs in the order they are shown. */
export const APP_TABS: readonly AppTabName[] = [
  TODAY_TAB,
  HISTORY_TAB,
  GOAL_TAB,
  SETTINGS_TAB,
];

/**
 * What a tab is called to a screen reader, and to a test.
 *
 * Distinct from the label printed on it, because three of the four screens head
 * themselves with the same word the tab bar prints — "History" the heading and
 * "History" the tab would otherwise be one string with two meanings.
 */
export function tabLabel(name: AppTabName): string {
  return `${name} tab`;
}

const Tab = createBottomTabNavigator<AppTabsParamList>();

export interface AppTabsProps {
  /** The persistence interface — the device one, or the fake. */
  readonly storage: HydrationStorage;
  /** Where the interval, the quiet hours and the off switch are stored. */
  readonly settings: ReminderSettingsStorage;
  /**
   * The one reminder service, shared by every screen that changes what is due.
   * A tree without one schedules nothing and behaves identically otherwise.
   */
  readonly reminders?: ReminderService;
  /** The current moment, injected so tests decide which day is today. */
  readonly now?: () => Date;
}

export function AppTabs({ storage, settings, reminders, now }: AppTabsProps) {
  // Counts of writes rather than flags, because what matters is that the number
  // changed since the screen mounted, not what it is.
  const [logged, setLogged] = useState(0);
  const [goals, setGoals] = useState(0);

  const dayChanged = useCallback(() => setLogged((count) => count + 1), []);
  const goalSaved = useCallback(() => setGoals((count) => count + 1), []);

  return (
    <NavigationContainer>
      <Tab.Navigator
        initialRouteName={TODAY_TAB}
        screenOptions={{
          // Each screen already heads itself, so a navigator header would print
          // the same word twice.
          headerShown: false,
        }}
      >
        <Tab.Screen
          name={TODAY_TAB}
          options={{ tabBarAccessibilityLabel: tabLabel(TODAY_TAB) }}
        >
          {() => (
            <TodayScreen
              key={goals}
              storage={storage}
              now={now}
              onDayChanged={dayChanged}
              reminders={reminders}
            />
          )}
        </Tab.Screen>

        <Tab.Screen
          name={HISTORY_TAB}
          options={{ tabBarAccessibilityLabel: tabLabel(HISTORY_TAB) }}
        >
          {() => <HistoryScreen key={`${logged}:${goals}`} storage={storage} now={now} />}
        </Tab.Screen>

        <Tab.Screen
          name={GOAL_TAB}
          options={{ tabBarAccessibilityLabel: tabLabel(GOAL_TAB) }}
        >
          {() => <GoalScreen storage={storage} now={now} onGoalSaved={goalSaved} />}
        </Tab.Screen>

        <Tab.Screen
          name={SETTINGS_TAB}
          options={{ tabBarAccessibilityLabel: tabLabel(SETTINGS_TAB) }}
        >
          {() => (
            <SettingsScreen
              settings={settings}
              storage={storage}
              reminders={reminders}
              now={now}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
