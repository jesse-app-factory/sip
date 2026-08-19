/**
 * Turning domain values into the strings a key-value store holds, and back.
 *
 * Reading and writing are deliberately asymmetric. Writing an invalid value is
 * a bug in the app and throws, so it is caught in a test rather than in a
 * user's history. Reading tolerates everything: absent, empty, truncated,
 * hand-edited or written by a future version of the app all yield the
 * documented defaults below instead of throwing, per docs/functional-spec.md,
 * "Data" — the app does not crash because storage returned something
 * unexpected.
 *
 * ## Documented defaults
 *
 * | Stored value                                   | Read back as                    |
 * | ---------------------------------------------- | ------------------------------- |
 * | absent, empty or blank                          | the default goal / `null` day   |
 * | not valid JSON                                  | the default goal / `null` day   |
 * | JSON of the wrong shape                         | the default goal / `null` day   |
 * | a day whose goal is missing or invalid          | `null`                          |
 * | a day whose entries are not an array            | that day, with no entries       |
 * | a day with some invalid entries among valid ones| that day, with the valid ones   |
 *
 * A day is `null` rather than an empty day because "no data for this date" and
 * "a date on which nothing was drunk" are different facts: only the second is
 * a day the user lived through with a goal, and history and streaks treat them
 * differently, per docs/functional-spec.md, "History".
 *
 * A day whose goal cannot be read is `null` for the same reason. Substituting
 * today's goal would fabricate the standard a past day was judged against,
 * which is exactly what "each day retains the goal that applied on that day"
 * forbids.
 */
import {
  assertEntry,
  assertGoal,
  createDay,
  Day,
  defaultGoal,
  Entry,
  Goal,
  LocalDate,
} from '../domain';

/** JSON, or `undefined` for anything unparseable — including `null` itself. */
function parseJson(raw: string | null): unknown {
  if (raw === null || raw.trim() === '') {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Encodes the daily goal. Throws `TypeError` if it is not a valid goal. */
export function encodeGoal(goal: Goal): string {
  assertGoal(goal);

  return JSON.stringify({ amountMl: goal.amountMl });
}

/**
 * Decodes the daily goal, falling back to the default goal of
 * `DEFAULT_GOAL_ML` for anything unreadable — the same goal a user who skips
 * onboarding gets, per docs/functional-spec.md, "First run".
 */
export function decodeGoal(raw: string | null): Goal {
  const parsed = parseJson(raw);

  try {
    assertGoal(parsed);
    // Rebuilt rather than returned as parsed, so no extra fields written by
    // some other version of the app travel any further into the app.
    return { amountMl: parsed.amountMl };
  } catch {
    return defaultGoal();
  }
}

/**
 * Encodes a day. Throws `TypeError` if the day is not valid, so a corrupt
 * value never reaches storage in the first place.
 */
export function encodeDay(day: Day): string {
  assertGoal(day.goal);
  day.entries.forEach(assertEntry);

  return JSON.stringify({
    date: day.date,
    goal: { amountMl: day.goal.amountMl },
    entries: day.entries.map((entry) => ({
      amountMl: entry.amountMl,
      loggedAt: entry.loggedAt,
    })),
  });
}

/** The valid entries of an unknown value, in the order they were stored. */
function decodeEntries(value: unknown): Entry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate): Entry[] => {
    try {
      assertEntry(candidate);
      return [{ amountMl: candidate.amountMl, loggedAt: candidate.loggedAt }];
    } catch {
      // One unreadable entry loses one glass, not the whole day.
      return [];
    }
  });
}

/**
 * Decodes the day stored under `date`, or `null` when there is nothing
 * readable there.
 *
 * The date comes from the key rather than from the record: the key is where
 * the day was filed, so it is what decides which day this is even if the
 * record disagrees with it.
 */
export function decodeDay(date: LocalDate, raw: string | null): Day | null {
  const parsed = parseJson(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const record = parsed as { goal?: unknown; entries?: unknown };

  try {
    assertGoal(record.goal);

    return createDay(date, { amountMl: record.goal.amountMl }, decodeEntries(record.entries));
  } catch {
    return null;
  }
}
