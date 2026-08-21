/**
 * Remembering that the user has already been through first run.
 *
 * docs/functional-spec.md, "First run": "Onboarding appears once. Completing it
 * or skipping it both prevent it appearing again." Appearing once means the
 * answer survives the app being closed, so it belongs here, next to the goal,
 * the days, the recorded permission and the settings, under its own key —
 * writing it rewrites none of the others, per docs/architecture.md, "Storage
 * layout".
 *
 * The two outcomes are kept apart rather than collapsed into a single "seen"
 * flag. Both suppress onboarding equally, so nothing in this task depends on
 * the difference; recording it costs nothing and is the kind of fact a later
 * version — one offering to finish setup from the settings screen, say — cannot
 * recover once it has been thrown away.
 *
 * Reading tolerates everything a real device accumulates — absent, empty,
 * truncated, hand-edited, or written by a later version of the app — and yields
 * `'pending'`, the state before anyone has been asked. That is the safe
 * fallback in both directions: onboarding can appear once more, and it can
 * always be skipped, so an unreadable record cannot lock anyone out of the app.
 */
import { ONBOARDING_KEY } from './keys';
import { KeyValueStore } from './keyValueStore';

/** How first run ended: the user went through it, or dismissed it. */
export type OnboardingOutcome = 'completed' | 'skipped';

/** Either outcome, or nobody having reached the end of onboarding yet. */
export type OnboardingState = 'pending' | OnboardingOutcome;

/** Both outcomes, so a decoder can check a stored value against one list. */
export const ONBOARDING_OUTCOMES: readonly OnboardingOutcome[] = ['completed', 'skipped'];

/** What the app assumes before anything has been recorded: this is first run. */
export const DEFAULT_ONBOARDING_STATE: OnboardingState = 'pending';

/** Narrows an unknown value — a stored string, say — to one of the outcomes. */
export function isOnboardingOutcome(value: unknown): value is OnboardingOutcome {
  return (
    typeof value === 'string' && ONBOARDING_OUTCOMES.includes(value as OnboardingOutcome)
  );
}

export interface OnboardingStorage {
  /**
   * The recorded outcome, or `'pending'` when nothing readable is stored.
   * Never throws.
   */
  readOnboarding(): Promise<OnboardingState>;

  /**
   * Records how onboarding ended, replacing any previous record. Throws
   * `TypeError` for anything that is not one of the two outcomes — `'pending'`
   * included, because "not finished yet" is the absence of a record rather than
   * a record — and resolves once it is stored.
   */
  writeOnboarding(outcome: OnboardingOutcome): Promise<void>;
}

/** Encodes the outcome. Throws `TypeError` if it is not one of the two. */
export function encodeOnboarding(outcome: OnboardingOutcome): string {
  if (!isOnboardingOutcome(outcome)) {
    throw new TypeError(
      `Onboarding is recorded as completed or skipped, received ${String(outcome)}`,
    );
  }

  // An object rather than a bare word, so a later version can add a field —
  // when it was answered, or which version showed it — without the old records
  // becoming unreadable.
  return JSON.stringify({ outcome });
}

/**
 * Decodes the recorded outcome, falling back to `'pending'` for anything
 * unreadable.
 */
export function decodeOnboarding(raw: string | null): OnboardingState {
  if (raw === null || raw.trim() === '') {
    return DEFAULT_ONBOARDING_STATE;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const candidate = (parsed as { outcome?: unknown } | null)?.outcome;

    return isOnboardingOutcome(candidate) ? candidate : DEFAULT_ONBOARDING_STATE;
  } catch {
    return DEFAULT_ONBOARDING_STATE;
  }
}

/**
 * Builds the record over any key-value store. The store is the only thing that
 * differs between the device and a test.
 */
export function createOnboardingStorage(store: KeyValueStore): OnboardingStorage {
  return {
    async readOnboarding(): Promise<OnboardingState> {
      return decodeOnboarding(await store.read(ONBOARDING_KEY));
    },

    async writeOnboarding(outcome: OnboardingOutcome): Promise<void> {
      // Encoded before the write so an invalid outcome throws instead of
      // landing in storage half-formed.
      await store.write(ONBOARDING_KEY, encodeOnboarding(outcome));
    },
  };
}
