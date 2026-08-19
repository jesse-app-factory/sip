/**
 * The port everything persistent goes through: string keys, string values,
 * asynchronous.
 *
 * It is deliberately smaller than AsyncStorage's own API. Everything above it
 * — the encoding, the defaults, the per-day keying — is plain logic that can
 * be tested against the in-memory implementation, and the only thing left
 * needing a device is the two-method adapter in `asyncStorage.ts`.
 *
 * See docs/architecture.md, "Why interfaces for storage and notifications":
 * CI has no device, so this interface is what makes the behaviour testable at
 * all rather than an abstraction for its own sake.
 */
export interface KeyValueStore {
  /** The stored value, or `null` when the key has never been written. */
  read(key: string): Promise<string | null>;

  /**
   * Writes a value, replacing any previous one under that key. Resolves once
   * the value is stored — logging waits for this, per docs/architecture.md,
   * "Data flow, logging a glass".
   */
  write(key: string, value: string): Promise<void>;
}
