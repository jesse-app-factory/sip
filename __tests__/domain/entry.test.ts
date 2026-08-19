/**
 * An entry is an amount and the ISO 8601 moment it was logged. The moment is
 * always passed in, never read from the clock.
 */
import { assertEntry, compareEntries, createEntry } from '../../src/domain';

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('createEntry', () => {
  it('carries the amount and an ISO 8601 timestamp', () => {
    const entry = createEntry(250, new Date('2026-08-18T09:30:00.000Z'));

    expect(entry.amountMl).toBe(250);
    expect(entry.loggedAt).toMatch(ISO_8601);
    expect(entry.loggedAt).toBe('2026-08-18T09:30:00.000Z');
  });

  it('accepts an ISO string, so a stored entry round-trips unchanged', () => {
    const original = createEntry(250, new Date('2026-08-18T09:30:00.000Z'));
    const restored = createEntry(original.amountMl, original.loggedAt);

    expect(restored).toEqual(original);
  });

  it('does not alias the Date it was given', () => {
    const loggedAt = new Date('2026-08-18T09:30:00.000Z');
    const entry = createEntry(250, loggedAt);

    loggedAt.setFullYear(1999);

    expect(entry.loggedAt).toBe('2026-08-18T09:30:00.000Z');
  });

  it('throws a TypeError for an invalid amount', () => {
    const at = new Date('2026-08-18T09:30:00.000Z');

    expect(() => createEntry(0, at)).toThrow(TypeError);
    expect(() => createEntry(-250, at)).toThrow(TypeError);
    expect(() => createEntry(12.5, at)).toThrow(TypeError);
    expect(() => createEntry('250' as unknown as number, at)).toThrow(TypeError);
  });

  it('throws a TypeError for a timestamp that is not a moment', () => {
    expect(() => createEntry(250, new Date('nonsense'))).toThrow(TypeError);
    expect(() => createEntry(250, 'yesterday')).toThrow(TypeError);
    expect(() => createEntry(250, '18/08/2026')).toThrow(TypeError);
    expect(() => createEntry(250, undefined as unknown as string)).toThrow(TypeError);
  });
});

describe('assertEntry', () => {
  it('accepts a created entry', () => {
    expect(() =>
      assertEntry(createEntry(250, '2026-08-18T09:30:00.000Z')),
    ).not.toThrow();
  });

  it('rejects anything that is not an entry', () => {
    expect(() => assertEntry(null)).toThrow(TypeError);
    expect(() => assertEntry(250)).toThrow(TypeError);
    expect(() => assertEntry({ amountMl: 250 })).toThrow(TypeError);
    expect(() => assertEntry({ amountMl: 250, loggedAt: 'soon' })).toThrow(TypeError);
  });
});

describe('compareEntries', () => {
  it('orders entries oldest first', () => {
    const earlier = createEntry(250, '2026-08-18T09:00:00.000Z');
    const later = createEntry(250, '2026-08-18T11:00:00.000Z');

    expect(compareEntries(earlier, later)).toBeLessThan(0);
    expect(compareEntries(later, earlier)).toBeGreaterThan(0);
    expect(compareEntries(earlier, earlier)).toBe(0);
  });
});
