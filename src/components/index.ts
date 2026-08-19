/**
 * The components: presentational, and given everything they need.
 *
 * docs/architecture.md, "The shape": components sit between the screens and
 * nothing at all. The blob and its animation are here, along with the one hook
 * that asks the platform something on their behalf — `useReduceMotion`, which
 * exists precisely so that the blob does not have to ask.
 */
export type { AnimatedBlobProps, BlobEyes, BlobMood, BlobProps } from './blob';

export {
  ANIMATED_BLOB_TEST_ID,
  AnimatedBlob,
  Blob,
  BLOB_CELEBRATION_TEST_ID,
  BLOB_HAPPY_TEST_ID,
  BLOB_MOODS,
  BLOB_TEST_ID,
  blobSize,
  CELEBRATION_DURATION_MS,
  CELEBRATION_PULSES,
  CELEBRATION_SCALE,
  CELEBRATION_STEP_MS,
  GROWTH_DURATION_MS,
  isHappy,
  RESTING_SCALE,
} from './blob';
export { useReduceMotion } from './useReduceMotion';
