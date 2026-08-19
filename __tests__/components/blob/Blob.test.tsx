/**
 * The blob as its acceptance criteria describe it: two props in, and a
 * rendered size and variant that follow from them and from nothing else.
 *
 * docs/testing-strategy.md, "Component tests": "The blob is tested as a
 * function of its props: three different progress values give three different
 * sizes, and a progress of 1 gives the happy variant."
 *
 * The rendered size is read from the SVG the component returns rather than
 * from `blobSize`, so these tests would still fail if the component stopped
 * passing that size on — `geometry.test.ts` covers the arithmetic itself.
 *
 * No storage, no fake clock and no domain function appears here, because the
 * blob has nothing to be given but its two props.
 */
import { render, screen } from '@testing-library/react-native';

import {
  Blob,
  BLOB_HAPPY_TEST_ID,
  BLOB_MOODS,
  BLOB_TEST_ID,
  blobSize,
  BlobMood,
} from '../../../src/components/blob';

/** The size the blob was actually drawn at, as the renderer sees it. */
function renderedSize(): { readonly width: number; readonly height: number } {
  const { height, width } = screen.getByTestId(BLOB_TEST_ID).props;

  return { height, width };
}

function showsHappyVariant(): boolean {
  return screen.queryByTestId(BLOB_HAPPY_TEST_ID) !== null;
}

describe('the size', () => {
  it('is a different value at 0, 0.5 and 1', () => {
    const sizes = [0, 0.5, 1].map((progress) => {
      render(<Blob mood="calm" progress={progress} />);
      const size = renderedSize().width;
      screen.unmount();

      return size;
    });

    expect(sizes).toEqual([blobSize(0), blobSize(0.5), blobSize(1)]);
    expect(new Set(sizes).size).toBe(3);
    expect(sizes[0]).toBeLessThan(sizes[1]);
    expect(sizes[1]).toBeLessThan(sizes[2]);
  });

  it('is square, so the blob grows in both directions at once', () => {
    render(<Blob mood="calm" progress={0.5} />);

    const { height, width } = renderedSize();
    expect(height).toBe(width);
  });

  it('follows progress and not the mood', () => {
    // Every mood at one progress is one size: the mood decides the face, and
    // only progress decides how big the blob is.
    const sizes = BLOB_MOODS.map((mood) => {
      render(<Blob mood={mood} progress={0.75} />);
      const size = renderedSize().width;
      screen.unmount();

      return size;
    });

    expect(new Set(sizes).size).toBe(1);
    expect(sizes[0]).toBe(blobSize(0.75));
  });

  it('changes when progress changes on a blob already on screen', () => {
    render(<Blob mood="calm" progress={0} />);
    expect(renderedSize().width).toBe(blobSize(0));

    screen.rerender(<Blob mood="calm" progress={0.5} />);
    expect(renderedSize().width).toBe(blobSize(0.5));

    screen.rerender(<Blob mood="calm" progress={1} />);
    expect(renderedSize().width).toBe(blobSize(1));
  });
});

describe('the happy variant', () => {
  it.each(BLOB_MOODS)('is rendered at a progress of 1, whatever the mood (%s)', (mood) => {
    render(<Blob mood={mood} progress={1} />);

    expect(showsHappyVariant()).toBe(true);
    expect(screen.getByTestId(BLOB_TEST_ID).props.accessibilityLabel).toContain('happy');
  });

  it('is rendered above a progress of 1 as well', () => {
    // The domain clamps progress to 1, but the blob is total: a value above 1
    // is still a met goal rather than an unhandled case.
    render(<Blob mood="calm" progress={1.5} />);

    expect(showsHappyVariant()).toBe(true);
  });

  it.each(BLOB_MOODS)('is not rendered below a progress of 1 (%s)', (mood) => {
    for (const progress of [0, 0.5, 0.999]) {
      render(<Blob mood={mood} progress={progress} />);

      expect(showsHappyVariant()).toBe(false);
      expect(screen.getByTestId(BLOB_TEST_ID).props.accessibilityLabel).not.toContain(
        'happy',
      );
      screen.unmount();
    }
  });

  it('appears and disappears as progress crosses 1', () => {
    render(<Blob mood="calm" progress={0.9} />);
    expect(showsHappyVariant()).toBe(false);

    screen.rerender(<Blob mood="calm" progress={1} />);
    expect(showsHappyVariant()).toBe(true);

    // Raising the goal part-way through a day can put the blob back below its
    // goal, and the blob follows the number it is handed either way.
    screen.rerender(<Blob mood="calm" progress={0.6} />);
    expect(showsHappyVariant()).toBe(false);
  });
});

describe('rendering twice', () => {
  const cases: readonly (readonly [number, BlobMood])[] = [
    [0, 'calm'],
    [0.5, 'thirsty'],
    [0.5, 'sleepy'],
    [1, 'calm'],
    [1, 'sleepy'],
  ];

  it.each(cases)(
    'produces identical output for identical props (%s, %s)',
    (progress, mood) => {
      const first = render(<Blob mood={mood} progress={progress} />).toJSON();
      screen.unmount();
      const second = render(<Blob mood={mood} progress={progress} />).toJSON();

      // Nothing here is random and nothing reads the clock, so two renders of
      // the same props are the same tree — including the order they happened
      // in and how much time passed between them.
      expect(second).toEqual(first);
    },
  );

  it('produces different output for different props', () => {
    // The control on the assertion above: identical trees would be worthless
    // evidence if every tree were identical.
    const half = render(<Blob mood="calm" progress={0.5} />).toJSON();
    screen.unmount();
    const full = render(<Blob mood="calm" progress={1} />).toJSON();
    screen.unmount();
    const sleepy = render(<Blob mood="sleepy" progress={0.5} />).toJSON();

    expect(full).not.toEqual(half);
    expect(sleepy).not.toEqual(half);
  });

  it('does not depend on what was rendered before it', () => {
    const alone = render(<Blob mood="calm" progress={0.25} />).toJSON();
    screen.unmount();

    render(<Blob mood="sleepy" progress={1} />);
    screen.unmount();
    render(<Blob mood="thirsty" progress={0} />);
    screen.unmount();
    const afterOthers = render(<Blob mood="calm" progress={0.25} />).toJSON();

    expect(afterOthers).toEqual(alone);
  });
});

describe('the props', () => {
  it('are the only thing the blob is given', () => {
    // No provider, no context and no storage: a blob rendered with nothing
    // around it renders exactly as it does anywhere else. `source.test.ts`
    // asserts the same thing of the sources, which is where it can be shown
    // that no other input exists rather than that none was needed here.
    expect(() => render(<Blob mood="calm" progress={0.5} />)).not.toThrow();
    expect(renderedSize().width).toBe(blobSize(0.5));
  });

  it('are tolerated outside 0 to 1 rather than crashing the screen', () => {
    render(<Blob mood="calm" progress={-1} />);
    expect(renderedSize().width).toBe(blobSize(0));

    screen.rerender(<Blob mood="calm" progress={Number.NaN} />);
    expect(renderedSize().width).toBe(blobSize(0));
  });
});
