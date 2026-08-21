/**
 * Screen wiring: which screen a launch opens on.
 *
 * The layer holds decisions that belong to no single screen, per
 * docs/technical-spec.md, "Structure". Today there is one such decision —
 * whether this is first run — and it is `FirstRunGate`'s.
 */
export type { FirstRunGateProps } from './FirstRunGate';

export { FIRST_RUN_LOADING_MESSAGE, FirstRunGate } from './FirstRunGate';
