# Sip — Agent Instructions

These rules govern work on this project. `docs/functional-spec.md`,
`docs/technical-spec.md` and `docs/architecture.md` are authoritative; where a
task description disagrees with them, they win and the disagreement is a blocker
to report rather than a choice to make.

## Dependencies are frozen after TASK-001

TASK-001 installs every dependency this project uses and owns `package.json`.

No other task may add, remove or upgrade a dependency. If a task appears to need
one that is not installed, that is a specification error: **report it as a
blocker**. Do not add the package, and do not work around its absence with a
hand-rolled substitute.

## Keep the layers apart

- `src/domain/` imports nothing from React, React Native, storage or any platform
  module. Pure functions over plain values.
- `src/components/blob/` imports nothing from `domain/` or `storage/`. It takes
  props and renders.
- Screens reach storage and notifications through their interfaces, never through
  AsyncStorage or `expo-notifications` directly.

These are checked by tests. They are also the reason the project is testable at
all, so a shortcut through them is not a shortcut.

## Never mutate

Functions that change a day return a new value. Nothing modifies its arguments.

## Tests run without a device

CI has no simulator, no emulator and no notification permission.

- Use the in-memory storage implementation, never AsyncStorage.
- Use the fake scheduler, never schedule a real notification or request a real
  permission.
- Take the current time as a parameter or from an injected source. Never read the
  clock directly in code a test needs to control.

A test that needs a device is a broken test, not a missing device.

## Every criterion gets a test

Each acceptance criterion on the issue must have a test that would fail if the
behaviour were removed. A green build with untested new behaviour is incomplete.

Tests must not depend on execution order, the network, or the real clock.

## No network, no secrets

This app makes no network request. There is no account, no API and no push
service.

Do not add an HTTP client, an analytics package, a crash reporter, or any
credential, token or key. If a task seems to require one, report it as a blocker.

## Animation

Durations are exported named constants, not inline numbers.

Reduce-motion is honoured by skipping to the final value, not by shortening the
duration. It is a requirement, not an enhancement.

An animation must never block an interaction.

## Scope

Change only what the assigned task requires. Do not reformat untouched files, do
not refactor adjacent code opportunistically, and do not add features from later
tasks because they seem easy.

The product brief lists things that are deliberately absent — accounts, sync,
sharing, health-platform integration. Adding one of these has not exceeded the
requirements; it has ignored them.

## Reporting blockers

Stop and report when a requirement conflicts with the governing documents, a
needed dependency is missing, the work cannot be done within the task's allowed
paths, or a criterion is impossible as written.

Never invent a missing requirement, weaken a criterion to make it pass, or commit
a change you cannot justify. Reporting an honest blocker is a successful outcome.
