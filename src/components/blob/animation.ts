/**
 * How long the blob takes to move, and how far it moves when it celebrates.
 *
 * docs/technical-spec.md, "Animation constraints": "Durations are exported
 * named constants rather than inline numbers, so tests can assert against them
 * and so tuning happens in one place."
 *
 * This is that one place. Nothing here is a decision about *when* to animate —
 * that is `AnimatedBlob.tsx` — only about how long a movement lasts and how
 * large it is, which are the two things a person tuning the feel of the app
 * will want to change and the two things a test can assert exactly.
 *
 * The numbers themselves are a starting point rather than a result. No check
 * can judge whether motion looks good — docs/testing-strategy.md, "Animation",
 * and docs/implementation-plan.md, "Known risks" — so the aesthetics are a
 * manual pass afterwards, and this file is deliberately the only thing that
 * pass has to edit.
 */

/**
 * How long the blob takes to grow from one progress to the next, in
 * milliseconds.
 *
 * Long enough to read as growth rather than as a jump, short enough that the
 * blob has settled before someone who logged two glasses in a row looks back
 * at it.
 */
export const GROWTH_DURATION_MS = 450;

/**
 * How long the whole celebration lasts, in milliseconds — the complete
 * squash-and-stretch, not one bounce of it.
 *
 * It runs alongside the growth that reaching the goal also causes, and outlasts
 * it, so the last thing seen is the celebration rather than the growth.
 */
export const CELEBRATION_DURATION_MS = 800;

/** How many times the blob bounces on reaching the goal. */
export const CELEBRATION_PULSES = 2;

/**
 * One half of one bounce: out to `CELEBRATION_SCALE`, or back to
 * `RESTING_SCALE`. Derived so that the pulses fill `CELEBRATION_DURATION_MS`
 * exactly however many of them there are, rather than being a second number to
 * keep in step with the first.
 */
export const CELEBRATION_STEP_MS = CELEBRATION_DURATION_MS / (CELEBRATION_PULSES * 2);

/** The scale the blob rests at, which is its own size and no more. */
export const RESTING_SCALE = 1;

/** How much larger than itself the blob swells at the top of a bounce. */
export const CELEBRATION_SCALE = 1.12;
