# Sip — Architecture

## The shape

Four layers, and dependencies only ever point downwards.

```text
screens/        what the user sees and touches
   │
components/     presentational, including the blob
   │
storage/  notifications/     interfaces with real and fake implementations
   │
domain/         pure logic, depends on nothing
```

`domain/` is at the bottom because it is the part worth being certain about, and
the only way to be certain cheaply is for it to have no dependencies to mock.

## Why interfaces for storage and notifications

Both are platform APIs that do not exist in the environment CI runs in. There is
no device, no simulator, and no permission to schedule anything.

An interface with a fake implementation is therefore not an abstraction for its
own sake — it is what allows the behaviour to be tested at all. The real
implementation is thin enough to read in one sitting; the logic that matters sits
above it and is tested against the fake.

The same pattern applies to time. Anything needing the current moment receives it
rather than reading the clock, because the day-rollover rules are otherwise
untestable without waiting until midnight.

## Why the blob knows nothing

A character that grows with progress is the obvious place for progress logic to
accumulate. Keeping the blob purely presentational — two props in, SVG out —
means the interesting behaviour stays in `domain/` where it is tested, and the
blob stays something that can be redesigned without risking the app.

It also makes the blob's own tests meaningful: given a progress value, its size
is a fact that can be asserted.

## Data flow, logging a glass

1. The screen calls the domain function to add an entry, receiving a new day
   value.
2. It writes that day through the storage interface, and waits for the write.
3. It updates the displayed state.
4. It recomputes progress and passes it to the blob, which animates.
5. It cancels the pending reminder and schedules the next through the
   notification interface.

Step 2 completes before the interaction is considered done. An entry visible on
screen but absent from storage is the failure this ordering exists to prevent.

## Data flow, a reminder

Reminders are not a loop or a background service. Each time an entry is logged,
the next reminder is scheduled and the previous one cancelled. At most one
reminder is pending at any moment.

The quiet-hours window is applied when choosing the fire time. If the computed
time falls inside the window, the reminder moves to the end of it.

Once the goal is met, no reminder is scheduled at all for the rest of that day.

## Storage layout

The goal, settings and each day are stored under separate keys, with days keyed
by local date. Writing today never rewrites yesterday, so a bug in today's path
cannot destroy history.

Reads tolerate absent and malformed values and return documented defaults.

## What has no architecture here

There is no server, no API client, no cache, no synchronisation and no
background worker. The app is a single process reading and writing local storage.
Every one of those absent pieces is a decision recorded in the product brief, not
an omission.
