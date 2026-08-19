/**
 * The blob: two props in, SVG out.
 *
 * It takes how far through the goal the day is, and what mood it should show.
 * It holds no state, reads no storage, imports nothing from `domain/`, and
 * never asks what time it is — everything it draws comes from `geometry.ts`,
 * which is arithmetic over those two props.
 *
 * That is what docs/architecture.md, "Why the blob knows nothing", is for: a
 * character that grows with progress is the obvious place for progress logic
 * to accumulate, and the logic worth being certain about belongs in `domain/`
 * where it is tested. Keeping this file to a mapping from numbers onto shapes
 * means the blob can be redrawn without risking the app, and that its own
 * tests mean something — given a progress, its size is a fact.
 *
 * There is no animation here. Movement between states is TASK-007's, and it
 * builds on this by animating the values these functions return; a blob that
 * is correct at rest is the thing worth having first.
 */
import { Circle, G, Path, Svg } from 'react-native-svg';

import {
  BLOB_BODY_PATH,
  BLOB_VIEW_BOX,
  BlobMood,
  blobEyes,
  blobFill,
  blobLabel,
  blobMouth,
  blobSize,
  CHEEK_FILL,
  INK,
  isHappy,
} from './geometry';

/** How a test finds the blob, and reads the size it was drawn at. */
export const BLOB_TEST_ID = 'blob';

/**
 * How a test finds the parts drawn only once the goal is met. Present exactly
 * when `isHappy` is true, so "does it show the happy variant" is a question
 * about the rendered tree rather than about a prop.
 */
export const BLOB_HAPPY_TEST_ID = 'blob-happy';

/** The face's stroke width, in view-box units. */
const STROKE = 3.5;

export interface BlobProps {
  /**
   * How far through the goal the day is, from 0 to 1. Values outside that
   * range are clamped rather than rejected, so the blob has no error state.
   */
  readonly progress: number;
  /** What the blob should show, other than pleasure — see `BlobMood`. */
  readonly mood: BlobMood;
}

/**
 * Two props and nothing else. Anything the blob needs to know is passed in,
 * per docs/technical-spec.md — there is no context read here, no hook, and no
 * default that would let a caller leave the blob to decide something.
 */
export function Blob({ progress, mood }: BlobProps) {
  const size = blobSize(progress);
  const happy = isHappy(progress);

  return (
    <Svg
      accessibilityLabel={blobLabel(progress, mood)}
      accessible
      height={size}
      testID={BLOB_TEST_ID}
      // The artwork is drawn once at view-box scale, so `size` changes how big
      // the blob is and never what it looks like.
      viewBox={`0 0 ${BLOB_VIEW_BOX} ${BLOB_VIEW_BOX}`}
      width={size}
    >
      <Path d={BLOB_BODY_PATH} fill={blobFill(progress)} />

      {blobEyes(mood) === 'closed' ? (
        <G>
          <Path
            d="M30 45 Q36 51 42 45"
            fill="none"
            stroke={INK}
            strokeLinecap="round"
            strokeWidth={STROKE}
          />
          <Path
            d="M58 45 Q64 51 70 45"
            fill="none"
            stroke={INK}
            strokeLinecap="round"
            strokeWidth={STROKE}
          />
        </G>
      ) : (
        <G>
          <Circle cx={36} cy={45} fill={INK} r={5} />
          <Circle cx={64} cy={45} fill={INK} r={5} />
        </G>
      )}

      <Path
        d={blobMouth(progress, mood)}
        // The grin is a closed shape and is filled; every other mouth is a
        // line, and filling one would draw a wedge across the face.
        fill={happy ? INK : 'none'}
        stroke={INK}
        strokeLinecap="round"
        strokeWidth={STROKE}
      />

      {happy && (
        <G testID={BLOB_HAPPY_TEST_ID}>
          <Circle cx={24} cy={62} fill={CHEEK_FILL} opacity={0.75} r={6} />
          <Circle cx={76} cy={62} fill={CHEEK_FILL} opacity={0.75} r={6} />
        </G>
      )}
    </Svg>
  );
}
