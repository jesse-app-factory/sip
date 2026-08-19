/**
 * Whether the operating system has been asked to reduce motion.
 *
 * docs/acceptance-criteria.md, "The blob": "With the operating system's
 * reduce-motion setting enabled, it renders directly in its final state with no
 * animation." The setting is the operating system's, so something has to ask
 * the platform for it — and that is the one thing the blob may not do, since it
 * is told everything it knows.
 *
 * So it is asked here, above the blob and below the screen, and handed down as
 * an ordinary prop. `AnimatedBlob` then has no platform dependency and can be
 * rendered in a test with the setting either way, which is what makes the
 * reduce-motion behaviour testable at all — the same reasoning storage and the
 * clock get in docs/architecture.md.
 *
 * The setting is watched rather than read once, because it can be turned on
 * while the app is open and the next animation should already be gone.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  // Motion is assumed to be welcome until the platform says otherwise, which
  // is the answer for almost every device and is corrected within a tick on
  // the ones it is wrong for. Nothing animates on first render in any case:
  // the blob arrives at whatever size its progress deserves.
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let watching = true;

    const apply = (enabled: boolean): void => {
      if (watching) {
        // Same answer, same state: the common case is the setting being off
        // and staying off, and that must not re-render anything.
        setReduceMotion((current) => (current === enabled ? current : enabled));
      }
    };

    AccessibilityInfo.isReduceMotionEnabled().then(apply, () => {
      // A platform that cannot answer is not an error state — it is a device
      // that has not asked for less motion.
      apply(false);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      apply,
    );

    return () => {
      watching = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
