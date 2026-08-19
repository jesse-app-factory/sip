/**
 * The time primitives. Every moment here is constructed explicitly, and the
 * local-date cases are built from local components so the suite passes in any
 * time zone.
 */
import {
  assertLocalDate,
  toInstant,
  toIsoTimestamp,
  toLocalDate,
} from '../../src/domain';

describe('toInstant', () => {
  it('accepts a Date and returns a copy rather than the same object', () => {
    const original = new Date('2026-08-18T09:00:00.000Z');

    const instant = toInstant(original, 'A moment');

    expect(instant).not.toBe(original);
    expect(instant.getTime()).toBe(original.getTime());
  });

  it('accepts an ISO 8601 string', () => {
    expect(toInstant('2026-08-18T09:00:00.000Z', 'A moment').getTime()).toBe(
      Date.parse('2026-08-18T09:00:00.000Z'),
    );
  });

  it('throws a TypeError for an invalid Date or a loose string', () => {
    expect(() => toInstant(new Date('nonsense'), 'A moment')).toThrow(TypeError);
    expect(() => toInstant('18 August 2026', 'A moment')).toThrow(TypeError);
    expect(() => toInstant('2026-13-45', 'A moment')).toThrow(TypeError);
    expect(() => toInstant(1755500000000, 'A moment')).toThrow(TypeError);
    expect(() => toInstant(null, 'A moment')).toThrow(TypeError);
  });
});

describe('toIsoTimestamp', () => {
  it('formats a moment as ISO 8601', () => {
    expect(toIsoTimestamp(new Date('2026-08-18T09:00:00.000Z'), 'A moment')).toBe(
      '2026-08-18T09:00:00.000Z',
    );
  });
});

describe('toLocalDate', () => {
  it('uses the local calendar date, not the UTC one', () => {
    // 23:30 local on the 18th is the 19th in UTC east of Greenwich and still
    // the 18th to the west. The local date is the day the user logged it on.
    const lateEvening = new Date(2026, 7, 18, 23, 30, 0);

    expect(toLocalDate(lateEvening)).toBe('2026-08-18');
  });

  it('pads single-digit months and days', () => {
    expect(toLocalDate(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
  });

  it('returns an existing local date key unchanged', () => {
    expect(toLocalDate('2026-08-18')).toBe('2026-08-18');
  });

  it('throws a TypeError for something that is not a date', () => {
    expect(() => toLocalDate('not-a-date')).toThrow(TypeError);
    expect(() => toLocalDate('2026-02-30')).toThrow(TypeError);
    expect(() => toLocalDate(undefined)).toThrow(TypeError);
  });
});

describe('assertLocalDate', () => {
  it('accepts a real calendar date', () => {
    expect(() => assertLocalDate('2026-08-18')).not.toThrow();
    expect(() => assertLocalDate('2028-02-29')).not.toThrow();
  });

  it('rejects a malformed or impossible date', () => {
    expect(() => assertLocalDate('2026-8-18')).toThrow(TypeError);
    expect(() => assertLocalDate('2026-02-30')).toThrow(TypeError);
    expect(() => assertLocalDate('2027-02-29')).toThrow(TypeError);
    expect(() => assertLocalDate(20260818)).toThrow(TypeError);
  });
});
