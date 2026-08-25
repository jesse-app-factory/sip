/**
 * Screen wiring: which screen a launch opens on, and how the user moves
 * between them afterwards.
 *
 * The layer holds decisions that belong to no single screen, per
 * docs/technical-spec.md, "Structure". There are two: whether this is first
 * run, which is `FirstRunGate`'s, and which of the four screens is in front of
 * the user, which is `AppTabs`'.
 */
export type { AppTabName, AppTabsParamList, AppTabsProps } from './AppTabs';
export type { FirstRunGateProps } from './FirstRunGate';

export {
  APP_TABS,
  AppTabs,
  GOAL_TAB,
  HISTORY_TAB,
  SETTINGS_TAB,
  tabLabel,
  TODAY_TAB,
} from './AppTabs';
export { FIRST_RUN_LOADING_MESSAGE, FirstRunGate } from './FirstRunGate';
