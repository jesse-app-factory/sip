# Sip — Functional Specification

This document is authoritative. Where a task description and this document
disagree, this document wins, and the disagreement is a blocker to report.

## The daily goal

The goal is a whole number of millilitres, greater than zero. It can be set at
any time, including part-way through a day.

Changing the goal does not change anything already logged. The two are
independent records: entries are what happened, the goal is what was intended.

Each day retains the goal that applied on that day. Raising today's goal does not
retroactively turn a past success into a failure.

## Logging

A glass is an entry with an amount in millilitres and an ISO 8601 timestamp.

Logging is one interaction and is persisted before that interaction completes. An
entry that exists on screen but not in storage is a defect.

Undo removes the most recent entry only. Undo on a day with no entries does
nothing and raises no error.

## The day boundary

A day runs from local midnight to local midnight. When the date changes:

- the new day starts with a total of zero;
- the previous day's entries and goal are retained in history;
- nothing already logged is discarded or moved.

## Progress and the goal being met

Progress is the day's total divided by the day's goal, clamped to a maximum of 1.
A day with no entries has a progress of 0.

The goal is met when the total is greater than or equal to the goal.

## The blob

The blob's appearance is determined entirely by the day's progress and a mood. It
grows as progress increases and shows a happy state once the goal is met.

The blob stores nothing and decides nothing. It is given values and renders them.

## Animation

Changes to the blob are animated rather than instant.

When the operating system's reduce-motion accessibility setting is enabled,
animations are skipped and the blob renders directly in its final state. This is
a requirement, not an enhancement.

Animation never blocks interaction. A second glass can be logged while an
animation from the first is still running.

## Reminders

A reminder is a local notification scheduled on the device. There is no server
and no push service.

- A reminder is scheduled for the configured interval after the most recent
  entry.
- Logging a glass cancels the pending reminder and schedules the next one.
- Once the day's goal is met, no further reminders are scheduled that day.
- No reminder is scheduled to fire inside the quiet-hours window.
- Reminders can be switched off entirely, which cancels anything pending.

Quiet hours may cross midnight — 22:00 to 07:00 is a valid window and must be
treated as one continuous period, not an empty one.

If notification permission is denied, the app continues to work fully. The denial
is recorded so the user is not asked on every launch.

## History

The last seven days are shown, each with its total and the goal that applied on
that day.

The current streak is the number of consecutive days on which the goal was met,
ending today or yesterday. A day with no data counts as not met and breaks the
streak. Today counts only once its goal has actually been met.

## First run

On first launch the user is offered onboarding: set an initial goal, and decide
about notification permission.

Onboarding appears once. Completing it or skipping it both prevent it appearing
again.

Skipping leaves a working app with a default goal of 2000 ml and reminders
switched off.

## Data

All data is stored on the device. There is no account, no synchronisation, and no
network request anywhere in the application.

Stored data that is missing or unreadable falls back to documented defaults
rather than crashing.
