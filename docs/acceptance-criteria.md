# Sip — Acceptance Criteria

The project is finished when all of the following hold. This is the document the
final acceptance judge reads, and it is written to be checkable rather than
aspirational.

## The app runs

- A clean checkout installs with `npm ci` and starts with the documented command.
- Lint, typecheck, test and build all exit 0 on the default branch.
- The app opens on a real phone through Expo Go without a native build.

## Setting a goal

- A daily goal in millilitres can be set on first use and changed at any time.
- Changing the goal leaves already-logged entries untouched.
- Invalid input is rejected on screen, and nothing is written.

## Logging

- A glass is logged in one interaction and persisted immediately.
- Undo removes the most recent glass only.
- Today's total, the goal and the remaining amount are all visible at once.
- Reopening the app on the same day shows the same total.
- Crossing local midnight starts a new day at zero and keeps the old day in
  history.

## The blob

- The blob's size is a function of the day's progress.
- It shows a distinct happy state once the goal is met.
- It animates between states rather than jumping.
- With the operating system's reduce-motion setting enabled, it renders directly
  in its final state with no animation.
- Logging is never blocked by an animation in progress.

## Reminders

- With reminders on, a local notification is scheduled when the configured
  interval passes without a glass being logged.
- Logging a glass cancels the pending reminder and schedules the next.
- No reminder is scheduled once the day's goal is met.
- No reminder is scheduled to fire inside the quiet-hours window, including a
  window that crosses midnight.
- Reminders can be switched off, cancelling anything pending.
- Denying notification permission leaves the app fully usable and is not asked
  again on every launch.

## History

- The last seven days are shown, each against the goal that applied that day.
- The current streak counts consecutive days meeting the goal, ending today or
  yesterday.
- A day with no data breaks the streak.
- An empty history renders without error.

## First run

- Onboarding appears on first launch and sets an initial goal.
- It never appears again, whether completed or skipped.
- Skipping leaves a working app with a 2000 ml default goal and reminders off.

## Privacy and data

- The application makes no network request of any kind.
- There is no account, no login and no synchronisation.
- The repository contains no credential, token or key.
- All data is on the device, and the README says so plainly.

## Documentation

- `README.md` explains what the app is, how to run it on a phone, and how to run
  the checks.
- Every command in the README works against the repository as it stands.
- Reminder behaviour, quiet hours and the reduce-motion behaviour are all
  documented.

## What is explicitly not required

Sharing, social features, health-platform integration, multi-device sync, and any
form of account. A submission adding these has not met the criteria more fully —
it has ignored the product brief.

## What cannot be judged automatically

Whether the blob is charming, whether the animation feels smooth, and whether the
colours are pleasant. These are real requirements of the product and no check
here covers them. They are settled by a person looking at the app, and their
absence from this list is deliberate rather than an oversight.
