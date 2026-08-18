/**
 * Amounts of water are whole millilitres greater than zero, everywhere in the
 * app: a goal, and the amount on a logged entry. The rule lives here once so
 * that a goal and an entry cannot drift apart on what counts as valid.
 *
 * A rejected amount throws `TypeError` rather than returning a sentinel,
 * because there is no useful invalid amount to carry around — see
 * docs/functional-spec.md, "The daily goal".
 */

/** Thrown reason shared by every rejection, so callers can match on the type. */
function reject(label: string, value: unknown): never {
  throw new TypeError(
    `${label} must be a whole number of millilitres greater than zero, received ${describe(value)}`,
  );
}

function describe(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'bigint' || value == null) {
    return String(value);
  }
  return typeof value;
}

/**
 * Narrows an unknown value to a valid amount in millilitres, throwing
 * `TypeError` when it is not a number, not an integer, or not greater than
 * zero. `Number.isInteger` also rejects `NaN` and both infinities.
 *
 * @param label how the value is named in the error message
 */
export function assertMillilitres(
  value: unknown,
  label: string,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    reject(label, value);
  }
}
