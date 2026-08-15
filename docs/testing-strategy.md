# Sip — Testing Strategy

## The constraint that shapes everything

CI runs on a Linux machine with no device, no simulator, no emulator and no
notification permission. Anything that reaches a real platform API cannot pass
there.

That single fact is why storage and notification scheduling are interfaces with
fakes, and why anything needing the current time receives it rather than reading
the clock. These are not stylistic preferences; they are the difference between a
suite that runs and one that does not.

## Layers, and what each is for

**Domain tests.** Plain function calls against plain values. No React, no mocks,
no setup. Goals, totals, progress, day boundaries and streaks are decided here,
so this is where the assertions should be densest and where a bug is cheapest to
find.

**Storage tests.** Run against the in-memory implementation. They cover the
shape of what is written and read, the per-day keying, and the fallback when
stored data is absent or malformed. **No test calls AsyncStorage.**

**Notification tests.** Run against the fake scheduler and assert what *would*
have been scheduled: that a reminder was scheduled at all, when, that logging
cancels and reschedules, that a met goal schedules nothing, and that quiet hours
push the fire time outside the window. **No test schedules a real notification or
requests a real permission.**

**Component tests.** `@testing-library/react-native`. The blob is tested as a
function of its props: three different progress values give three different
sizes, and a progress of 1 gives the happy variant.

**Screen tests.** Render the screen with fake storage and a fake scheduler, and
assert on what the user would see and what was persisted.

## Time

Anything time-dependent takes the current moment as a parameter or from an
injected source.

The day-rollover behaviour is untestable otherwise, and it is one of the
behaviours most likely to be wrong. A test that logs a glass, advances the
injected clock past midnight, and asserts a fresh day with the old one in history
is worth more than any amount of manual checking.

## Animation

What can be tested: that a transition is used rather than a direct assignment,
that the exported duration constants are the ones the triggers reference, that
reaching the goal fires a different animation from ordinary growth, that
reduce-motion skips to the final value, and that logging still works while an
animation runs.

What cannot be tested: whether it looks good. No assertion covers this and none
should pretend to.

## What every task must do

Each task's own acceptance criteria are covered by tests it adds. "The checks
pass" is necessary and not sufficient — a task that adds behaviour with no test
for it is incomplete even with a green build.

Tests must not depend on execution order, on the network, or on the real clock.

## Coverage

No numeric coverage threshold. A percentage target encourages tests of the code
that is easiest to reach rather than the behaviour that matters. The requirement
is that every acceptance criterion has a test that would fail if the behaviour
were removed.
