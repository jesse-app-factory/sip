/**
 * The blob character.
 *
 * Presentational, per docs/architecture.md, "The shape": the component sits
 * between the screens and nothing at all. It depends on no layer below it —
 * not storage, not the domain — because everything it needs arrives as a prop.
 *
 * `geometry.ts` is exported alongside the component so that whatever composes
 * the blob, and whatever animates it in TASK-007, can use the same arithmetic
 * the rendering uses rather than a second copy of it.
 */
export type { BlobProps } from './Blob';
export type { BlobEyes, BlobMood } from './geometry';

export { Blob, BLOB_HAPPY_TEST_ID, BLOB_TEST_ID } from './Blob';
export {
  BLOB_BODY_PATH,
  BLOB_MOODS,
  BLOB_VIEW_BOX,
  blobEyes,
  blobFill,
  blobLabel,
  blobMouth,
  blobSize,
  CHEEK_FILL,
  clampProgress,
  EMPTY_FILL,
  FULL_FILL,
  HAPPY_MOUTH_PATH,
  INK,
  isHappy,
  MAX_BLOB_SIZE,
  MIN_BLOB_SIZE,
} from './geometry';
