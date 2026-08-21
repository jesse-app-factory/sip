# Sip

Sip is a water-drinking companion for a phone. You set a daily goal in
millilitres, tap once whenever you drink a glass, and a blob character grows as
the day fills up and celebrates when the goal is reached. If you have not had a
drink for a while, Sip reminds you — with a local notification scheduled on the
phone itself. There is no account, no server and no network request anywhere in
the app: everything it knows lives in the phone's own storage.

It runs on a real phone through [Expo Go](https://expo.dev/go), so getting it
onto a device needs no Xcode, no Android Studio and no developer account.

## What you need

- **Node.js 22** and npm. CI runs on Node 22; anything older is untested here.
- A phone with **Expo Go** installed, from the App Store or Google Play. It must
  be a version of Expo Go that supports Expo SDK 57, which is what this app is
  built against.
- The phone and the computer on the **same Wi-Fi network**, because the phone
  loads the app from the development server running on the computer.

## Install and run

```bash
npm install
npm start
```

`npm start` runs `expo start`, which starts the Metro development server and
prints a QR code in the terminal. Leave it running for as long as you are using
the app.

### Opening it on a phone with Expo Go

1. Run `npm start` on the computer and wait for the QR code.
2. **On Android:** open Expo Go, choose *Scan QR code*, and point it at the
   terminal.
   **On iOS:** open the Camera app, point it at the QR code, and tap the
   notification banner that appears.
3. The first load bundles the JavaScript and takes a few seconds; later loads are
   quicker. Pressing `r` in the terminal reloads the app on the phone.

Sip only ever schedules *local* notifications, so it needs no push token and no
Expo account. Expo Go dropped support for remote push notifications in SDK 53,
and you may see a warning to that effect; it does not apply to anything Sip does.
If a device or a build of Expo Go refuses to schedule notifications at all, the
rest of the app carries on working exactly as before — a refused or unavailable
notification is a supported state, not an error.

## The checks

These four commands are the whole of the project's automated checking, and CI
runs exactly these on every change:

| Command            | What it does                                                            |
| ------------------ | ----------------------------------------------------------------------- |
| `npm run lint`     | ESLint over the repository, with the Expo config.                       |
| `npm run typecheck`| `tsc --noEmit` against `strict: true` TypeScript.                       |
| `npm test`         | The Jest suite: domain, storage, notifications, components and screens. |
| `npm run build`    | `expo export`, producing a JavaScript bundle in `dist/`.                |

`npm run build` is a packaging check rather than a release step. It proves the
app compiles and bundles without a native toolchain; it does **not** produce an
installable `.apk` or `.ipa`, and cannot, because that needs EAS Build or local
native toolchains plus developer accounts. `dist/` is ignored by git.

The tests never touch the network, a real clock, AsyncStorage or a real
notification. Storage and notification scheduling are TypeScript interfaces with
a real implementation and a fake one, and anything that needs the current moment
is handed it, which is what lets behaviour like the midnight rollover be tested
at all.

## How reminders behave

A reminder is a local notification scheduled on the device. There is no server,
no push service and no background loop — at most one reminder is pending at any
moment, and every change re-decides what that one reminder should be.

**When one fires.** A reminder is due the configured interval after your most
recent glass. The interval is **two hours** unless you change it. Logging a glass
cancels the pending reminder and schedules the next one, so drinking regularly
means never being reminded. If you open the app when the interval has already
elapsed, the next reminder is scheduled a full interval from that moment rather
than immediately — you are already looking at the app, so the useful reminder is
the next one.

**When one does not.** Once the day's total reaches the day's goal, nothing
further is scheduled for that day. Nothing is scheduled while reminders are
switched off. And if notification permission has been refused, nothing is
scheduled and the app keeps working; the refusal is recorded so you are not asked
again on every launch.

**The interval** can be set to 30 minutes, 1 hour, 1 hour 30 minutes, 2 hours,
3 hours or 4 hours. A new interval takes effect immediately, moving the pending
reminder rather than waiting for the next glass.

### Quiet hours

Quiet hours are a window of the day that no reminder may fire inside. They are
off by default; switching them on offers **22:00 to 07:00**, and any other pair
of `HH:MM` times on the 24-hour clock can be typed instead.

A reminder that would fall inside the window is **moved to the end of it** rather
than fired and then dismissed. A reminder due at three in the morning, with the
suggested window, arrives at seven — the phone is never asked to make a sound you
asked it not to.

A window may run through midnight: 22:00 to 07:00 is one continuous quiet night,
not an empty window. The start of the window is inside it and the end is not, so
a reminder due at exactly the end time is the first one let through. A window
whose start and end are the same minute covers no time at all and is refused when
you try to save it — if you want no reminders, switch reminders off, which also
cancels anything pending.

### Switching reminders off

The **Reminders** switch on the settings screen turns them off entirely. Doing so
cancels whatever was pending and schedules nothing until you turn them back on.

Reminders also end up off without you touching that switch in two cases during
first-run onboarding: skipping setup, and answering *No reminders*. Skipping
leaves a working app with the default goal of 2000 ml a day and reminders off,
and both can be changed afterwards.

## Your data stays on the phone

Everything Sip stores — the goal, each day's entries, the reminder settings, the
recorded answer about notification permission and whether onboarding has run — is
written to the phone's own application storage under keys beginning `sip:`. Each
day gets its own key, so writing today never rewrites yesterday.

There is **no account, no sign-in, no server, no synchronisation, no analytics
and no network request** anywhere in the app. Nothing you log leaves the device.

The consequence is worth being plain about: there is also no backup, no export
and no way to move your history to another phone. **Uninstalling the app or
clearing its data loses your history and your goal**, and there is nowhere to
restore it from. That is the accepted trade for having no account and no server.

## Accessibility: reduce motion

The blob's growth and its celebration are animated — growth over 450 ms, a
two-bounce celebration over 800 ms — but only when motion is welcome.

**When the operating system's reduce-motion setting is on, animations are
skipped**: the blob is rendered directly in its final state at the size the
current progress deserves, with no growth transition and no celebration bounce.
The setting is watched rather than read once, so turning it on while the app is
open removes the very next animation. This is a requirement rather than an
enhancement, and it is honoured by skipping to the final value rather than by
making the animation quicker.

Animations never gate an interaction either. A second glass can be logged while
the first one's animation is still running.

## How the app is used

- **Set a goal.** A whole number of millilitres, greater than zero. It can be
  changed at any time, including part-way through a day, and changing it never
  changes anything already logged.
- **Log a glass.** One tap on a glass size — 200, 250, 330 or 500 ml. The entry
  is written to storage before the tap is considered finished, so anything on
  screen has already been saved. *Undo last glass* removes the most recent entry
  only.
- **The day.** A day runs from local midnight to local midnight. At midnight the
  new day starts at zero and the previous day keeps its entries and the goal that
  applied to it. The app rechecks the date every 30 seconds while it is open, so
  a glass logged just after midnight belongs to the new day.
- **History.** The last seven days, each with its total and the goal that applied
  on that day, plus the current streak: consecutive days on which the goal was
  met, ending today or yesterday. A day with no data counts as not met and breaks
  the streak, and today counts only once its goal has actually been met.

## What is wired into the app today

Worth knowing before you open it on a phone: `App.tsx` currently mounts first-run
onboarding and then the **goal screen** only. The today, history and settings
screens are built and covered by tests, but nothing yet renders them, so the
running app is onboarding plus goal-setting rather than the whole product
described above. No task in `docs/implementation-plan.md` wires them together;
this README describes what the code does, and this section says which parts of it
a phone can currently reach.

## Layout

```text
App.tsx           the composition root: which storage and scheduler the app runs on
src/
  domain/         pure logic — no React, no storage, no platform imports
  storage/        the persistence interface, its device and in-memory versions
  notifications/  reminder rules, the scheduling interface and its fake
  components/     presentational components, including blob/
  screens/        the goal, today, history, settings and onboarding screens
  navigation/     first-run wiring
__tests__/        mirrors src/
docs/             the product brief and the functional, technical and test specs
```

The documents under `docs/` are authoritative about behaviour; this README
describes how to run what they specify.
