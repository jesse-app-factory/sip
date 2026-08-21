/**
 * The window no reminder may fire inside.
 *
 * docs/implementation-plan.md names the risk this suite exists for: "A window
 * from 22:00 to 07:00 is the normal case and the one a naive implementation
 * gets wrong by treating start > end as an empty range." So the
 * midnight-crossing window is asserted from both sides of midnight, at both
 * ends of the window, and against the ordinary window that does not cross it.
 *
 * Every moment here is built from local parts — `new Date(year, month, …)` —
 * rather than from a UTC string, because quiet hours are local times, per
 * docs/technical-spec.md, "Time". The assertions therefore hold in whichever
 * zone the suite runs in.
 */
import {
  assertQuietHours,
  assertTimeOfDay,
  createQuietHours,
  crossesMidnight,
  describeQuietHours,
  isEmptyWindow,
  isQuietHours,
  isTimeOfDay,
  isWithinQuietHours,
  minutesIntoDay,
  outsideQuietHours,
} from '../../src/notifications/quietHours';

/** A local moment, so the window's local times mean what they say. */
const local = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date => new Date(year, month - 1, day, hour, minute, 0, 0);

const NIGHT = createQuietHours('22:00', '07:00');
const LUNCH = createQuietHours('13:00', '14:00');

describe('a time of day', () => {
  it.each(['00:00', '07:00', '09:05', '22:00', '23:59'])('accepts %p', (time) => {
    expect(isTimeOfDay(time)).toBe(true);
    expect(() => assertTimeOfDay(time, 'A time')).not.toThrow();
  });

  it.each(['7:00', '24:00', '22:60', '22', '2200', '22:00:00', '', 'evening', null, 7])(
    'refuses %p',
    (time) => {
      expect(isTimeOfDay(time)).toBe(false);
      expect(() => assertTimeOfDay(time, 'A time')).toThrow(TypeError);
    },
  );

  it('is measured in minutes from local midnight', () => {
    expect(minutesIntoDay('00:00')).toBe(0);
    expect(minutesIntoDay('07:00')).toBe(7 * 60);
    expect(minutesIntoDay('22:30')).toBe(22 * 60 + 30);
    expect(minutesIntoDay('23:59')).toBe(24 * 60 - 1);
  });
});

describe('a window', () => {
  it('is a start and an end', () => {
    expect(NIGHT).toEqual({ start: '22:00', end: '07:00' });
    expect(describeQuietHours(NIGHT)).toBe('22:00 to 07:00');
  });

  it('refuses ends that are not times of day', () => {
    expect(() => createQuietHours('22:00', '7pm')).toThrow(TypeError);
    expect(() => createQuietHours('bedtime', '07:00')).toThrow(TypeError);
    expect(() => assertQuietHours({ start: '22:00' })).toThrow(TypeError);
    expect(() => assertQuietHours(null)).toThrow(TypeError);
    expect(isQuietHours({ start: '22:00', end: '07:00' })).toBe(true);
    expect(isQuietHours({ start: '22:00', end: 7 })).toBe(false);
  });

  it('knows whether it crosses midnight', () => {
    expect(crossesMidnight(NIGHT)).toBe(true);
    expect(crossesMidnight(LUNCH)).toBe(false);
  });

  it('covers nothing when its ends are the same minute', () => {
    // A whole day of quiet is "no reminder ever", which switching reminders
    // off says plainly — so this is read as an empty window instead.
    const empty = createQuietHours('08:00', '08:00');

    expect(isEmptyWindow(empty)).toBe(true);
    expect(isWithinQuietHours(empty, local(2026, 8, 18, 8, 30))).toBe(false);
    expect(outsideQuietHours(empty, local(2026, 8, 18, 8, 30))).toEqual(
      local(2026, 8, 18, 8, 30),
    );
  });
});

describe('a window crossing midnight', () => {
  it.each([
    ['at its start', local(2026, 8, 18, 22)],
    ['late in the evening', local(2026, 8, 18, 23, 59)],
    ['at midnight', local(2026, 8, 19, 0)],
    ['in the small hours', local(2026, 8, 19, 3)],
    ['a minute before it ends', local(2026, 8, 19, 6, 59)],
  ])('contains a moment %s', (_name, moment) => {
    expect(isWithinQuietHours(NIGHT, moment)).toBe(true);
  });

  it.each([
    ['at its end', local(2026, 8, 19, 7)],
    ['during the morning', local(2026, 8, 19, 9)],
    ['a minute before it starts', local(2026, 8, 18, 21, 59)],
  ])('excludes a moment %s', (_name, moment) => {
    expect(isWithinQuietHours(NIGHT, moment)).toBe(false);
  });

  it('is one continuous period rather than an empty range', () => {
    // The naive reading of start > end is "no minute is inside", which would
    // schedule a reminder at three in the morning.
    const minutes = Array.from({ length: 24 }, (_, hour) => local(2026, 8, 18, hour));
    const inside = minutes.filter((moment) => isWithinQuietHours(NIGHT, moment));

    expect(inside).toHaveLength(9);
  });
});

describe('moving a moment out of the window', () => {
  it('leaves a moment already outside exactly where it was', () => {
    const noon = local(2026, 8, 18, 12);

    expect(outsideQuietHours(NIGHT, noon)).toEqual(noon);
    expect(outsideQuietHours(null, noon)).toEqual(noon);
  });

  it('moves a moment in the small hours to the end of the window that morning', () => {
    expect(outsideQuietHours(NIGHT, local(2026, 8, 19, 3))).toEqual(local(2026, 8, 19, 7));
  });

  it('moves a moment before midnight to the end of the window the next morning', () => {
    // The end has already passed today, so the window this moment is inside is
    // the one ending tomorrow — the case a naive implementation gets wrong.
    expect(outsideQuietHours(NIGHT, local(2026, 8, 18, 23, 30))).toEqual(
      local(2026, 8, 19, 7),
    );
  });

  it('moves a moment inside an ordinary window to its end the same day', () => {
    expect(outsideQuietHours(LUNCH, local(2026, 8, 18, 13, 30))).toEqual(
      local(2026, 8, 18, 14),
    );
  });

  it('never answers a moment inside the window, whenever it is asked', () => {
    // Every ten minutes of a whole day, from either window.
    for (const window of [NIGHT, LUNCH]) {
      for (let step = 0; step < 6 * 24; step += 1) {
        const moment = new Date(local(2026, 8, 18, 0).getTime() + step * 10 * 60 * 1000);

        expect(isWithinQuietHours(window, outsideQuietHours(window, moment))).toBe(false);
      }
    }
  });

  it('never answers a moment earlier than the one it was given', () => {
    for (let step = 0; step < 6 * 24; step += 1) {
      const moment = new Date(local(2026, 8, 18, 0).getTime() + step * 10 * 60 * 1000);

      expect(outsideQuietHours(NIGHT, moment).getTime()).toBeGreaterThanOrEqual(
        moment.getTime(),
      );
    }
  });

  it('answers a new value rather than the moment it was handed', () => {
    const noon = local(2026, 8, 18, 12);
    const moved = outsideQuietHours(NIGHT, noon);

    moved.setFullYear(2000);

    expect(noon.getFullYear()).toBe(2026);
  });
});
