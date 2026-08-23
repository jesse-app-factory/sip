# Sip — Implementation Plan

Fifteen tasks. The order below is the dependency order, and it is chosen so that
each task is verifiable when it lands rather than only once something later
arrives.

## The chain

Listed in execution order. The identifiers are labels, not positions —
TASK-013 and TASK-014 were added when the original TASK-001 was split, and
keeping the numbers of the tasks after it meant not rewriting a dozen issues
that were already correct.

| Task     | Builds                              | Depends on    |
| -------- | ----------------------------------- | ------------- |
| TASK-001 | Expo scaffold, lint/typecheck/build | —             |
| TASK-013 | Jest and one passing test           | 001           |
| TASK-014 | The four feature dependencies       | 013           |
| TASK-002 | Pure hydration logic                | 013           |
| TASK-003 | On-device persistence               | 002, 014      |
| TASK-004 | Goal setting                        | 003           |
| TASK-005 | Logging, undo, today's total        | 004           |
| TASK-006 | The blob, presentational            | 014           |
| TASK-007 | Animation                           | 005, 006      |
| TASK-008 | Local reminders                     | 005           |
| TASK-009 | Settings: interval, quiet hours     | 008           |
| TASK-010 | History and streak                  | 003           |
| TASK-011 | First-run onboarding                | 004, 009      |
| TASK-012 | README                              | 007, 010, 011 |

### The task that was missing

TASK-015 assembles the screens into the app, and it was not in the original
plan. That omission is the most useful thing this project has produced.

Fourteen tasks each built a piece — a screen, the domain model, the storage
layer, the reminder service — and every one of them passed its own acceptance
criteria and its own independent review. None of them was wrong. But nothing
mounted the screens, no navigation library was installed, and no
`ReminderService` was ever constructed in the running app, so the shipped
product let a user set a goal and do nothing else.

The acceptance judge rejected it: eighteen criteria met, seventeen not, and
every unmet one downstream of the same gap. It is the only gate that reads
`docs/acceptance-criteria.md` and asks whether the assembled product does what
was asked, rather than whether one task did what it was told — which is exactly
why it caught what fourteen reviews structurally could not.

The lesson for the next package: **a plan made of parts needs a task that
makes the whole.** Decomposition is not free, and the seam between the pieces
belongs to someone.

### Why the setup is three tasks

It was one, and it failed twice — exhausting a 60-turn budget and then a
100-turn one without committing anything. The work was not wrong; there was
too much of it to land in a single run, and a run that lands nothing leaves
nothing to build on.

Split, each piece is verifiable on its own. TASK-013 in particular gets the
React Native Jest preset — the fiddliest part of the whole setup — to itself,
rather than competing for turns with four dependency installs.

TASK-006 and TASK-010 depend on early tasks rather than on the chain, so they can
be built at several points in the sequence. That is intentional — it exercises
the dependency graph rather than a straight line.

## Why this order

**The toolchain first.** TASK-001, TASK-013 and TASK-014 exist to prove lint, typecheck, test and build
all work before anything depends on them. An Expo and Jest setup that half-works
is the single most likely way for this project to stall, and it is far cheaper to
discover in the first task than the fifth.

**Logic before screens.** TASK-002 is pure functions with no UI. Everything about
goals, totals, progress and day boundaries is decided and tested there, so the
screens above it are assembly rather than invention.

**Storage before anything that persists.** TASK-003 establishes the interface and
the fake. Every later task uses it rather than reaching for AsyncStorage, and the
fake is what makes those later tests possible.

**The blob before its animation.** TASK-006 makes the blob correct as a function
of progress; TASK-007 makes it move. Splitting these keeps the untestable part
(does it look good) isolated from the testable part (is it the right size), so a
failure in one does not obscure the other.

**Reminders before their settings.** TASK-008 builds the scheduling behaviour with
fixed values; TASK-009 makes those values configurable. The reverse order would
mean building settings for something that does not yet exist.

**The README last.** TASK-012 documents what was actually built rather than what
was planned, and its criteria require that every command it lists really runs.

## What each task must leave behind

Every task ends with lint, typecheck, test and build all exiting 0, and with
tests covering its own acceptance criteria. A task that adds behaviour without
tests is incomplete regardless of whether the app appears to work.

## Known risks

**The Jest configuration in TASK-013.** React Native testing needs a specific
preset and transform configuration, and if it is wrong every later task fails
for reasons unrelated to its own work. This is the task most worth reading
carefully when it lands.

It is also the reason the setup is split at all: this configuration used to
share a run with the scaffold and four dependency installs, and that run ran
out of turns twice without committing anything.

**Testing animation.** No automated check can decide whether motion looks
pleasant. TASK-007's criteria therefore constrain triggers, durations and the
reduce-motion behaviour, and say nothing about aesthetics. Tuning how it actually
feels is a manual pass afterwards, not something the loop can be asked to do.

**Quiet hours crossing midnight.** A window from 22:00 to 07:00 is the normal
case and the one a naive implementation gets wrong by treating start > end as an
empty range. TASK-009 names it explicitly for that reason.
