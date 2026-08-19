/**
 * The blob's appearance as arithmetic, tested without rendering anything.
 *
 * Everything the component draws comes from these functions, so this is where
 * "the blob is the right size for this progress" is settled. `Blob.test.tsx`
 * then only has to show that what is rendered is what these return.
 *
 * Nothing here imports from `domain/` or `storage/` — the blob is given a
 * number between 0 and 1 and knows nothing about where it came from, per
 * docs/architecture.md, "Why the blob knows nothing".
 */
import {
  BLOB_MOODS,
  blobEyes,
  blobFill,
  blobLabel,
  blobMouth,
  blobSize,
  clampProgress,
  EMPTY_FILL,
  FULL_FILL,
  HAPPY_MOUTH_PATH,
  isHappy,
  MAX_BLOB_SIZE,
  MIN_BLOB_SIZE,
} from '../../../src/components/blob';

describe('clamping progress', () => {
  it('leaves a progress between 0 and 1 alone', () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(0.5)).toBe(0.5);
    expect(clampProgress(1)).toBe(1);
  });

  it('clamps anything outside that range rather than rejecting it', () => {
    expect(clampProgress(1.5)).toBe(1);
    expect(clampProgress(-0.2)).toBe(0);
  });

  it('treats a value that is not a number as no progress at all', () => {
    // A blob with a width of NaN renders nothing at all, which is a worse
    // failure than a small blob.
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('the size', () => {
  it('is a different value at 0, 0.5 and 1', () => {
    expect(blobSize(0)).toBe(MIN_BLOB_SIZE);
    expect(blobSize(0.5)).toBe((MIN_BLOB_SIZE + MAX_BLOB_SIZE) / 2);
    expect(blobSize(1)).toBe(MAX_BLOB_SIZE);

    expect(new Set([blobSize(0), blobSize(0.5), blobSize(1)]).size).toBe(3);
  });

  it('grows with progress and never shrinks', () => {
    const sizes = [0, 0.1, 0.25, 0.4, 0.75, 0.9, 1].map(blobSize);

    for (let index = 1; index < sizes.length; index += 1) {
      expect(sizes[index]).toBeGreaterThan(sizes[index - 1]);
    }
  });

  it('stays within its bounds for a progress outside 0 to 1', () => {
    expect(blobSize(2)).toBe(MAX_BLOB_SIZE);
    expect(blobSize(-1)).toBe(MIN_BLOB_SIZE);
  });

  it('depends on nothing but progress', () => {
    // Called twice, and from a different mood's rendering, it is the same
    // number: no clock is read and nothing is remembered between calls.
    expect(blobSize(0.37)).toBe(blobSize(0.37));
  });
});

describe('the happy variant', () => {
  it('is shown at a progress of 1 or above', () => {
    expect(isHappy(1)).toBe(true);
    expect(isHappy(1.2)).toBe(true);
  });

  it('is not shown below a progress of 1', () => {
    expect(isHappy(0)).toBe(false);
    expect(isHappy(0.5)).toBe(false);
    expect(isHappy(0.999)).toBe(false);
  });

  it('replaces whatever mouth the mood would have drawn', () => {
    for (const mood of BLOB_MOODS) {
      expect(blobMouth(1, mood)).toBe(HAPPY_MOUTH_PATH);
      expect(blobMouth(0.9, mood)).not.toBe(HAPPY_MOUTH_PATH);
    }
  });

  it('is not something a mood can ask for', () => {
    // Happiness follows from the goal being met, per
    // docs/functional-spec.md, so it is deliberately absent from the moods:
    // the two props cannot disagree about whether the blob is pleased.
    expect(BLOB_MOODS as readonly string[]).not.toContain('happy');
  });
});

describe('the face', () => {
  it('gives each mood its own mouth', () => {
    const mouths = BLOB_MOODS.map((mood) => blobMouth(0.5, mood));

    expect(new Set(mouths).size).toBe(BLOB_MOODS.length);
  });

  it('closes the eyes only when the blob is sleepy', () => {
    expect(blobEyes('sleepy')).toBe('closed');
    expect(blobEyes('calm')).toBe('open');
    expect(blobEyes('thirsty')).toBe('open');
  });

  it('keeps the eyes the mood asked for once the goal is met', () => {
    // A goal met at midnight is a contented blob rather than a wide-awake one.
    expect(blobEyes('sleepy')).toBe('closed');
    expect(blobMouth(1, 'sleepy')).toBe(HAPPY_MOUTH_PATH);
  });
});

describe('the body colour', () => {
  it('runs from the empty colour to the full one', () => {
    expect(blobFill(0)).toBe(EMPTY_FILL);
    expect(blobFill(1)).toBe(FULL_FILL);
  });

  it('is a different colour part-way through, and a valid one', () => {
    const half = blobFill(0.5);

    expect(half).toMatch(/^#[0-9a-f]{6}$/);
    expect(half).not.toBe(EMPTY_FILL);
    expect(half).not.toBe(FULL_FILL);
  });
});

describe('what a screen reader is told', () => {
  it('names the progress and the mood', () => {
    expect(blobLabel(0, 'calm')).toBe('Blob at 0%, calm');
    expect(blobLabel(0.5, 'thirsty')).toBe('Blob at 50%, thirsty');
  });

  it('says happy once the goal is met, whatever the mood', () => {
    for (const mood of BLOB_MOODS) {
      expect(blobLabel(1, mood)).toBe('Blob at 100%, happy');
    }
  });

  it('says nothing about water', () => {
    // The screen states the total, the goal and the remaining amount in words.
    // The blob is not a second place those figures are described.
    for (const mood of BLOB_MOODS) {
      for (const progress of [0, 0.5, 1]) {
        expect(blobLabel(progress, mood)).not.toMatch(/ml|water|glass|goal/i);
      }
    }
  });
});
