/**
 * The fake scheduler, tested on its own.
 *
 * Every other notification test asserts through this one, so what it records
 * has to be right: a fake that quietly forgets a cancellation would make the
 * suites above it agree with themselves and with nothing else.
 *
 * Nothing here reaches `expo-notifications`. The fake schedules into a list,
 * and the permission prompt is modelled rather than shown — see
 * docs/testing-strategy.md, "Notification tests".
 */
import { createFakeReminderScheduler } from '../../src/notifications/fakeScheduler';
import { Reminder } from '../../src/notifications/reminder';

const reminder = (fireAt: string): Reminder => ({
  title: 'Time for a glass',
  body: 'Have some water.',
  fireAt,
});

const FIRST = reminder('2026-08-18T12:00:00.000Z');
const SECOND = reminder('2026-08-18T14:00:00.000Z');

describe('the fake scheduler', () => {
  it('starts holding nothing', async () => {
    const scheduler = createFakeReminderScheduler();

    expect(scheduler.all()).toEqual([]);
    expect(scheduler.pending()).toEqual([]);
    expect(scheduler.cancelled()).toEqual([]);
    expect(scheduler.prompts()).toBe(0);
    expect(await scheduler.getPermission()).toBe('undetermined');
  });

  it('records what was scheduled, under an id of its own', async () => {
    const scheduler = createFakeReminderScheduler();

    const id = await scheduler.schedule(FIRST);

    expect(scheduler.pending()).toEqual([{ ...FIRST, id }]);
  });

  it('gives every reminder a distinct id', async () => {
    const scheduler = createFakeReminderScheduler();

    const first = await scheduler.schedule(FIRST);
    const second = await scheduler.schedule(SECOND);

    expect(first).not.toBe(second);
    expect(scheduler.all().map((entry) => entry.id)).toEqual([first, second]);
  });

  it('stops counting a cancelled reminder as pending, but remembers it', async () => {
    const scheduler = createFakeReminderScheduler();
    const first = await scheduler.schedule(FIRST);
    const second = await scheduler.schedule(SECOND);

    await scheduler.cancel(first);

    expect(scheduler.pending().map((entry) => entry.id)).toEqual([second]);
    expect(scheduler.all()).toHaveLength(2);
    expect(scheduler.cancelled()).toEqual([first]);
  });

  it('treats cancelling something it never scheduled as no error', async () => {
    const scheduler = createFakeReminderScheduler();

    await expect(scheduler.cancel('never-scheduled')).resolves.toBeUndefined();
  });

  it('reports the permission it was built in without prompting', async () => {
    const scheduler = createFakeReminderScheduler({ permission: 'granted' });

    expect(await scheduler.getPermission()).toBe('granted');
    expect(scheduler.prompts()).toBe(0);
  });

  it('settles on what it was told a prompt settles on, and counts it', async () => {
    const scheduler = createFakeReminderScheduler({ whenPrompted: 'denied' });

    expect(await scheduler.requestPermission()).toBe('denied');
    expect(await scheduler.getPermission()).toBe('denied');
    expect(scheduler.prompts()).toBe(1);
  });

  it('follows the user changing their mind in the settings app', async () => {
    const scheduler = createFakeReminderScheduler({ permission: 'granted' });

    scheduler.setPermission('denied');

    expect(await scheduler.getPermission()).toBe('denied');
  });

  it('hands out its own copy of what it holds', async () => {
    const scheduler = createFakeReminderScheduler();
    await scheduler.schedule(FIRST);

    scheduler.all().pop();

    expect(scheduler.all()).toHaveLength(1);
  });

  it('leaks nothing from one scheduler into the next', async () => {
    await createFakeReminderScheduler().schedule(FIRST);

    expect(createFakeReminderScheduler().all()).toEqual([]);
  });
});
