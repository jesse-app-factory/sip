/**
 * The blob, in motion.
 *
 * `Blob.tsx` is correct at rest: given a progress, it draws a blob of the size
 * that progress deserves. This wraps it so that moving from one progress to
 * the next happens over time rather than in a single frame, and so that
 * reaching the goal is celebrated rather than merely arrived at.
 *
 * ## Why the movement is here and not in the blob
 *
 * The blob stays two props in, SVG out — docs/technical-spec.md, "The blob is
 * presentational". Everything animated lives in this file, so the drawing can
 * be redesigned without touching the motion and the motion retuned without
 * touching the drawing. Like the blob, this component is told everything it
 * needs, including whether the operating system has asked for less motion; it
 * reads no setting and holds no application state of its own.
 *
 * ## How the size is animated
 *
 * The artwork is drawn at the size the *target* progress deserves and then
 * scaled, rather than being redrawn at every size along the way. An SVG scales
 * without redrawing, so the growth costs one animated value rather than a
 * render per frame, and the blob is drawn at exactly its own size — a scale of
 * 1 — whenever it is standing still.
 *
 * Two views, because the two movements are two facts and a test should be able
 * to read either without the other in the way: the outer one carries the
 * growth, the inner one carries the celebration. Their scales compose, so the
 * blob can bounce while it is still growing, which is exactly what reaching the
 * goal does.
 *
 * The celebration is keyed on whether the goal is met, so it runs on the glass
 * that meets it and not on the ones after it. A blob mounted with the goal
 * already met celebrates once as it appears: to a component told nothing but a
 * progress, reaching the goal and opening the app to find it reached are the
 * same fact, and the day it was met is the day worth marking either way.
 *
 * ## Reduce motion
 *
 * docs/technical-spec.md: "Reduce-motion is honoured by skipping to the final
 * value, not by shortening the duration." With `reduceMotion` set, both values
 * are assigned rather than animated, so the blob is at its final size on the
 * frame the progress changed and never leaves its resting scale.
 *
 * ## Animations never gate anything
 *
 * Nothing here is awaited by anything, and nothing here is disabled while an
 * animation runs. A progress arriving mid-animation retargets the animation
 * from wherever it had got to, so a second glass logged during the first
 * glass's growth is logged, shown and animated like any other.
 */
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Blob } from './Blob';
import {
  CELEBRATION_PULSES,
  CELEBRATION_SCALE,
  CELEBRATION_STEP_MS,
  GROWTH_DURATION_MS,
  RESTING_SCALE,
} from './animation';
import { BlobMood, blobSize, isHappy } from './geometry';

/** How a test finds the growing box, and reads the size the blob has reached. */
export const ANIMATED_BLOB_TEST_ID = 'animated-blob';

/**
 * How a test finds the celebration, and reads how far through it the blob is.
 * It is a separate view from the growth so that "did it celebrate" is a
 * question growth cannot answer for it.
 */
export const BLOB_CELEBRATION_TEST_ID = 'blob-celebration';

export interface AnimatedBlobProps {
  /** How far through the goal the day is, from 0 to 1, as the blob's own prop. */
  readonly progress: number;
  /** What the blob should show, other than pleasure — see `BlobMood`. */
  readonly mood: BlobMood;
  /**
   * Whether the operating system has asked for reduced motion. Passed in
   * rather than read here: the blob is handed what it needs to know, and a
   * test can therefore render both answers without touching a platform API.
   */
  readonly reduceMotion: boolean;
}

export function AnimatedBlob({ progress, mood, reduceMotion }: AnimatedBlobProps) {
  // The size the blob is heading for, and the size its artwork is drawn at.
  const target = blobSize(progress);
  const happy = isHappy(progress);

  // Re-evaluated when the target changes and not on every render, so a screen
  // re-rendering for its own reasons does not restart the growth.
  const size = useDerivedValue(
    () => (reduceMotion ? target : withTiming(target, { duration: GROWTH_DURATION_MS })),
    [target, reduceMotion],
  );

  // Keyed on whether the goal is met rather than on progress, so this runs on
  // the glass that reaches the goal and not on any glass after it.
  const celebration = useDerivedValue(
    () =>
      happy && !reduceMotion
        ? withRepeat(
            withSequence(
              withTiming(CELEBRATION_SCALE, { duration: CELEBRATION_STEP_MS }),
              withTiming(RESTING_SCALE, { duration: CELEBRATION_STEP_MS }),
            ),
            CELEBRATION_PULSES,
          )
        : RESTING_SCALE,
    [happy, reduceMotion],
  );

  const growth = useAnimatedStyle(() => ({
    // The layout box follows the animated size, so the screen around the blob
    // makes room for it as it grows instead of afterwards.
    width: size.value,
    height: size.value,
    // The artwork inside is drawn at `target`; this is what puts it at the
    // size reached so far.
    transform: [{ scale: size.value / target }],
  }));

  const bounce = useAnimatedStyle(() => ({
    transform: [{ scale: celebration.value }],
  }));

  // With reduced motion the animated values are not merely told to finish
  // early — they are left out of the tree altogether, and these ordinary
  // styles are rendered instead. An animated value settles on the frame after
  // the one it was set on, which is a frame more than "renders directly at its
  // final size" allows, so under this setting nothing animated is on screen
  // at all.
  const still = { width: target, height: target };
  const stillBounce = { transform: [{ scale: RESTING_SCALE }] };

  return (
    <Animated.View
      // Keyed on the setting so that turning it on mid-day replaces the moving
      // blob with a still one rather than leaving a stopped animation attached
      // to it. It changes when the setting changes and at no other time.
      key={reduceMotion ? 'still' : 'moving'}
      style={[styles.box, reduceMotion ? still : growth]}
      testID={ANIMATED_BLOB_TEST_ID}
    >
      <Animated.View
        style={reduceMotion ? stillBounce : bounce}
        testID={BLOB_CELEBRATION_TEST_ID}
      >
        <Blob mood={mood} progress={progress} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Centred, because the artwork is only the same size as its box when the
  // blob is standing still; while it grows it overflows the box evenly on
  // every side rather than off one corner.
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
