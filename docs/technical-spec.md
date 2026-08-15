# Sip — Technical Specification

## Stack

| Concern       | Choice                                    |
| ------------- | ----------------------------------------- |
| Framework     | Expo (React Native)                       |
| Language      | TypeScript, `strict: true`                |
| Storage       | `@react-native-async-storage/async-storage` |
| Animation     | `react-native-reanimated`                 |
| Vector art    | `react-native-svg`                        |
| Notifications | `expo-notifications`, local only          |
| Tests         | Jest with `@testing-library/react-native` |

Expo rather than bare React Native because the app needs no custom native code,
and Expo Go lets the app run on a real phone by scanning a QR code — no Xcode, no
Android Studio, no developer account.

## Dependencies are fixed at TASK-001

TASK-001 installs every dependency the project will use and owns `package.json`
for the whole project. No later task may modify dependencies.

This is deliberate. It means a later task cannot quietly add a package nobody
reviewed, and it removes an entire class of merge conflict. The cost is that a
task needing an unforeseen dependency is blocked rather than proceeding — which
is the correct outcome: it is a specification error, and it should be fixed in
the specification.

## Structure

```text
src/
  domain/         pure logic — no React, no storage, no platform imports
  storage/        the persistence interface and its implementations
  notifications/  the scheduling interface and its implementations
  components/     presentational components, including blob/
  screens/        screens composing the above
  navigation/     screen wiring
__tests__/        mirrors src/
```

## Ports and fakes

Storage and notification scheduling are each defined as a TypeScript interface
with two implementations: a real one and a fake used by tests.

This is not ceremony. CI runs with no device, no simulator and no notification
permission, so a test that reaches a real platform API cannot pass there. The
interface is what makes the logic testable at all.

**No test may call AsyncStorage or schedule a real notification.**

## Purity of the domain layer

Nothing under `src/domain/` may import React, React Native, or any storage or
platform module. It is plain TypeScript operating on plain values.

Every function that changes a day returns a new value rather than mutating its
argument.

## The blob is presentational

`src/components/blob/` receives `progress` and `mood` as props and renders. It
imports nothing from `domain/` or `storage/`, holds no state, and produces
identical output for identical props — no randomness, no reading the clock.

If the blob needs to know something, it is passed in.

## Animation constraints

Durations are exported named constants rather than inline numbers, so tests can
assert against them and so tuning happens in one place.

Reduce-motion is honoured by skipping to the final value, not by shortening the
duration.

Animations must never gate an interaction.

## Notifications

Local scheduling only. `expo-notifications` schedules a notification on the
device; nothing is sent anywhere.

There is no push token, no VAPID key, no server, and therefore no secret. **The
repository must contain no credential of any kind.**

Quiet hours are enforced when scheduling, by choosing a fire time outside the
window. They are not enforced by dismissing a notification after it arrives.

## Time

All dates are local. The day boundary is local midnight.

Anything that reads the current time takes it as a parameter or from an injected
source, so tests can control it. A test that depends on the real clock is a
defect — the day-rollover behaviour in particular cannot be tested otherwise.

## Error handling

Unreadable or absent stored data yields documented defaults. The app does not
crash because storage returned something unexpected.

Denied notification permission is a supported state, not an error path.

## What is out of scope

No network layer. No authentication. No analytics or crash reporting. No
background task beyond the local notification schedule. No native module
requiring a custom development build.
