/**
 * The blob's appearance, as arithmetic over its two props.
 *
 * docs/technical-spec.md, "The blob is presentational": the blob "receives
 * `progress` and `mood` as props and renders. It imports nothing from
 * `domain/` or `storage/`, holds no state, and produces identical output for
 * identical props — no randomness, no reading the clock."
 *
 * Everything the component draws is decided here, by plain functions of those
 * two values, so that "the blob is the right size for this progress" is a fact
 * a test can assert without rendering anything. `Blob.tsx` is then only the
 * mapping from these numbers onto SVG elements.
 *
 * Nothing in this file knows what progress is progress *of*. It is a number
 * between 0 and 1; that it happens to be millilitres drunk over millilitres
 * intended is the domain's business, per docs/architecture.md, "Why the blob
 * knows nothing".
 */

/**
 * What the blob can be feeling, which is deliberately not "happy".
 *
 * Happiness is not a mood here: docs/functional-spec.md says the blob "shows a
 * happy state once the goal is met", which makes it a function of `progress`
 * alone. Leaving it out of this union is what stops the two props from
 * disagreeing about whether the blob is pleased.
 *
 * The moods that remain are the ones progress cannot express — the app is
 * quiet (`calm`), a drink is overdue (`thirsty`), or it is the middle of the
 * night (`sleepy`).
 */
export const BLOB_MOODS = ['calm', 'thirsty', 'sleepy'] as const;

export type BlobMood = (typeof BLOB_MOODS)[number];

/** Whether the eyes are drawn open or closed. */
export type BlobEyes = 'open' | 'closed';

/** The rendered size, in points, at a progress of 0 — small, but still there. */
export const MIN_BLOB_SIZE = 96;

/** The rendered size, in points, at a progress of 1. */
export const MAX_BLOB_SIZE = 220;

/**
 * The side of the square the artwork is drawn in. The blob is drawn once at
 * this scale and the rendered size scales it, so growing changes how large the
 * blob is and never what it looks like.
 */
export const BLOB_VIEW_BOX = 100;

/** The body colour at a progress of 0. */
export const EMPTY_FILL = '#bcdcf5';

/** The body colour at a progress of 1 — the blue the app logs a glass in. */
export const FULL_FILL = '#2b7fd4';

/** The face colour, which does not vary. */
export const INK = '#12384f';

/** The blush the blob only ever wears once the goal is met. */
export const CHEEK_FILL = '#f0879e';

/** The body outline, in the coordinates of the view box. */
export const BLOB_BODY_PATH =
  'M50 6 C76 6 95 24 95 49 C95 75 76 95 50 95 C24 95 5 77 5 51 C5 24 24 6 50 6 Z';

/** The grin worn at a progress of 1 or above, whatever the mood. */
export const HAPPY_MOUTH_PATH = 'M32 58 Q50 82 68 58 Z';

const MOUTH_PATHS: Readonly<Record<BlobMood, string>> = {
  calm: 'M38 64 Q50 71 62 64',
  thirsty: 'M39 69 Q50 62 61 69',
  sleepy: 'M43 68 Q50 72 57 68',
};

const EYE_STATES: Readonly<Record<BlobMood, BlobEyes>> = {
  calm: 'open',
  thirsty: 'open',
  sleepy: 'closed',
};

/**
 * `progress` between 0 and 1, whatever arrived.
 *
 * The domain already clamps progress, so in the running app this changes
 * nothing. It is here so that every function below is total: a blob handed
 * 1.5, -0.2 or `NaN` draws something sensible rather than an SVG with a
 * negative width, and the component has no error state to render.
 */
export function clampProgress(progress: number): number {
  // `NaN` is the one value clamping cannot help with — it compares false
  // against everything, so it would pass straight through `Math.min` and give
  // the SVG a width of `NaN`, which draws nothing at all. An empty-looking
  // blob is a better failure than an absent one.
  if (Number.isNaN(progress)) {
    return 0;
  }

  return Math.min(1, Math.max(0, progress));
}

/**
 * The rendered size, in points: a straight line from `MIN_BLOB_SIZE` at a
 * progress of 0 to `MAX_BLOB_SIZE` at 1.
 *
 * Linear rather than eased because docs/acceptance-criteria.md asks that "the
 * blob's size is a function of the day's progress", and a reader should be
 * able to see which size belongs to which progress without solving a curve.
 */
export function blobSize(progress: number): number {
  return MIN_BLOB_SIZE + (MAX_BLOB_SIZE - MIN_BLOB_SIZE) * clampProgress(progress);
}

/**
 * Whether the blob shows its happy variant.
 *
 * True at a progress of 1 or above and false below it. Progress reaches 1
 * exactly when the total has reached the goal — docs/functional-spec.md,
 * "Progress and the goal being met" — so this is "the goal is met" expressed
 * in the only terms the blob is given.
 */
export function isHappy(progress: number): boolean {
  return clampProgress(progress) >= 1;
}

function channels(hex: string): readonly number[] {
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
}

/**
 * The body colour: `EMPTY_FILL` at a progress of 0, deepening evenly to
 * `FULL_FILL` at 1, as a `#rrggbb` string.
 */
export function blobFill(progress: number): string {
  const filled = clampProgress(progress);
  const from = channels(EMPTY_FILL);
  const to = channels(FULL_FILL);

  const mixed = from.map((value, index) =>
    Math.round(value + (to[index] - value) * filled)
      .toString(16)
      .padStart(2, '0'),
  );

  return `#${mixed.join('')}`;
}

/** Whether the eyes are open, which is the mood's business alone. */
export function blobEyes(mood: BlobMood): BlobEyes {
  return EYE_STATES[mood];
}

/**
 * The mouth to draw. The happy grin overrides the mood's own mouth, because
 * the goal being met is the stronger thing to say; the eyes still follow the
 * mood, so a goal met at midnight is a contented blob rather than a wide-awake
 * one.
 */
export function blobMouth(progress: number, mood: BlobMood): string {
  return isHappy(progress) ? HAPPY_MOUTH_PATH : MOUTH_PATHS[mood];
}

/**
 * What a screen reader says. Deliberately about the blob and not about water:
 * the screen states the total, the goal and the amount remaining in words, and
 * repeating them here would make the blob the second place those figures are
 * described.
 */
export function blobLabel(progress: number, mood: BlobMood): string {
  const percent = Math.round(clampProgress(progress) * 100);

  return `Blob at ${percent}%, ${isHappy(progress) ? 'happy' : mood}`;
}
