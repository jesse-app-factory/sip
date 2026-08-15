# Sip — Deployment Strategy

## There is no deployment

Nothing is deployed, because there is nothing to deploy to. The app has no
server, no API and no hosted component. It runs entirely on the phone.

This document exists to say that plainly, and to describe how the app actually
gets onto a device.

## How the app is run

**Development and everyday use: Expo Go.** Start the development server, scan the
QR code with the Expo Go app, and it runs on the phone. No Xcode, no Android
Studio, no developer account, no build step.

For a personal app this is the whole story. It is how the app is expected to be
used.

## What CI does

The repository's CI runs lint, typecheck, test and build on every change. `build`
produces a JavaScript bundle, which verifies the app compiles and packages
without needing any native toolchain.

CI does **not** produce an installable `.ipa` or `.apk`, and cannot. That needs
either EAS Build with an Expo account, or local native toolchains plus Apple and
Google developer accounts. None of those exist for this project and none is
required by its acceptance criteria.

## If a standalone build is ever wanted

It is a manual step taken by a person, outside this repository's automation:

1. Create an Expo account and configure EAS Build.
2. For iOS, enrol in the Apple Developer Program; for Android, create a Google
   Play developer account.
3. Run the EAS build and distribute the result.

This is deliberately out of scope. It requires credentials, costs money annually,
and none of it is needed to use the app.

## Releases

A release is a tag and release notes on the repository, marking a commit whose
checks are green. It is a record of what was built, not a distribution mechanism.

## Secrets

There are none, and there must be none.

The app makes no network request, holds no API key, and uses no push service.
Local notifications need no credential. **Any credential appearing in this
repository is a defect, not a configuration step.**

## Data and privacy

All data is on the device, in application storage. There is no backup, no export
and no synchronisation. Uninstalling the app or clearing its data loses the
history, and the README says so.

That is an accepted trade for having no account and no server.
