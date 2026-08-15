# Sip — Implementation Plan

Twelve tasks. The order below is the dependency order, and it is chosen so that
each task is verifiable when it lands rather than only once something later
arrives.

## The chain

| Task     | Builds                              | Depends on         |
| -------- | ----------------------------------- | ------------------ |
| TASK-001 | Expo skeleton, all dependencies     | —                  |
| TASK-002 | Pure hydration logic                | 001                |
| TASK-003 | On-device persistence               | 002                |
| TASK-004 | Goal setting                        | 003                |
| TASK-005 | Logging, undo, today's total        | 004                |
| TASK-006 | The blob, presentational            | 001                |
| TASK-007 | Animation                           | 005, 006           |
| TASK-008 | Local reminders                     | 005                |
| TASK-009 | Settings: interval, quiet hours     | 008                |
| TASK-010 | History and streak                  | 003                |
| TASK-011 | First-run onboarding                | 004, 009           |
| TASK-012 | README                              | 007, 010, 011      |

TASK-006 and TASK-010 depend on early tasks rather than on the chain, so they can
be built at several points in the sequence. That is intentional — it exercises
the dependency graph rather than a straight line.

## Why this order

**The toolchain first.** TASK-001 exists to prove lint, typecheck, test and build
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

**The Expo and Jest configuration in TASK-001.** React Native testing needs a
specific Jest preset and transform configuration. If TASK-001 gets this wrong,
every subsequent task fails for reasons unrelated to its own work. This is the
task most worth reading carefully when it lands.

**Testing animation.** No automated check can decide whether motion looks
pleasant. TASK-007's criteria therefore constrain triggers, durations and the
reduce-motion behaviour, and say nothing about aesthetics. Tuning how it actually
feels is a manual pass afterwards, not something the loop can be asked to do.

**Quiet hours crossing midnight.** A window from 22:00 to 07:00 is the normal
case and the one a naive implementation gets wrong by treating start > end as an
empty range. TASK-009 names it explicitly for that reason.
