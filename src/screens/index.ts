/**
 * The screens: what the user sees and touches.
 *
 * A screen is assembly. It composes the domain's functions and the storage
 * interface it is handed, and holds only the state the view itself needs —
 * see docs/architecture.md, "The shape". Nothing here reaches a platform API
 * directly, which is what lets every screen be rendered in a test.
 */
export type { GoalScreenProps, ParsedGoal } from './GoalScreen';
export type { SettingsScreenProps } from './SettingsScreen';
export type { TodayScreenProps } from './TodayScreen';

export {
  EMPTY_GOAL_MESSAGE,
  GOAL_INPUT_LABEL,
  GoalScreen,
  NOT_A_NUMBER_MESSAGE,
  NOT_POSITIVE_MESSAGE,
  NOT_WHOLE_MESSAGE,
  parseGoalInput,
  SAVED_MESSAGE,
} from './GoalScreen';
export {
  EMPTY_WINDOW_MESSAGE,
  formatDuration,
  INTERVAL_OPTIONS_MS,
  intervalOptionLabel,
  intervalSummary,
  INVALID_TIME_MESSAGE,
  QUIET_HOURS_END_LABEL,
  QUIET_HOURS_LABEL,
  QUIET_HOURS_START_LABEL,
  quietHoursSummary,
  REMINDERS_LABEL,
  REMINDERS_OFF_MESSAGE,
  SAVE_QUIET_HOURS_LABEL,
  SETTINGS_LOADING_MESSAGE,
  SETTINGS_SAVED_MESSAGE,
  SETTINGS_WRITE_FAILED_MESSAGE,
  SettingsScreen,
  switchLabel,
} from './SettingsScreen';
export {
  BLOB_MOOD,
  DATE_CHECK_INTERVAL_MS,
  GLASS_SIZES_ML,
  glassButtonLabel,
  GOAL_LABEL,
  GOAL_MET_MESSAGE,
  LOADING_MESSAGE,
  REMAINING_LABEL,
  statLabel,
  TodayScreen,
  TOTAL_LABEL,
  UNDO_LABEL,
  WRITE_FAILED_MESSAGE,
} from './TodayScreen';
