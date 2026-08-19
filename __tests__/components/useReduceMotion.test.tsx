/**
 * Asking the operating system whether it wants less motion.
 *
 * This is the one thing in the blob's world that touches a platform API, and
 * it is separated from the blob for the reason docs/architecture.md gives for
 * storage and the clock: an interface that can be faked is what makes the
 * behaviour above it testable. `AnimatedBlob` is handed the answer, so its
 * reduce-motion behaviour is tested without any platform involved at all; what
 * is left to test here is that the answer is the platform's, and that it keeps
 * up when the setting is changed while the app is open.
 *
 * `AccessibilityInfo` is the React Native module that reports the setting.
 * Nothing here reaches a real device: the module is spied on, which is the
 * closest a Linux CI machine with no phone attached can get to a person
 * turning the switch.
 */
import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';

import { useReduceMotion } from '../../src/components';

const REDUCED = 'reduced';
const FULL = 'full';

function Probe() {
  return <Text>{useReduceMotion() ? REDUCED : FULL}</Text>;
}

const removed = jest.fn();

/**
 * Stands in for the platform: what it reports the setting to be, and a way to
 * change it afterwards the way a person leaving the app to change it would.
 */
function platformSays(enabled: boolean | Promise<boolean>): {
  change(value: boolean): void;
} {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockReturnValue(Promise.resolve(enabled));

  const listeners: ((value: boolean) => void)[] = [];
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((_event, handler) => {
      // The module's handler type is the union of every accessibility event's;
      // the one registered for this event is handed a boolean.
      listeners.push(handler as unknown as (value: boolean) => void);

      return { remove: removed } as never;
    });

  return {
    change(value: boolean) {
      expect(listeners).not.toHaveLength(0);
      for (const listener of listeners) {
        listener(value);
      }
    },
  };
}

/** Renders the probe and lets the platform's answer arrive. */
async function open(): Promise<void> {
  render(<Probe />);
  await act(async () => {});
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the reduce-motion setting', () => {
  it('is off when the platform reports it off', async () => {
    platformSays(false);

    await open();

    expect(screen.getByText(FULL)).toBeOnTheScreen();
  });

  it('is on when the platform reports it on', async () => {
    platformSays(true);

    await open();

    expect(screen.getByText(REDUCED)).toBeOnTheScreen();
  });

  it('follows the setting being turned on while the app is open', async () => {
    const platform = platformSays(false);
    await open();

    await act(async () => platform.change(true));

    expect(screen.getByText(REDUCED)).toBeOnTheScreen();
  });

  it('follows it being turned off again', async () => {
    const platform = platformSays(true);
    await open();

    await act(async () => platform.change(false));

    expect(screen.getByText(FULL)).toBeOnTheScreen();
  });

  it('treats a platform that cannot answer as motion being welcome', async () => {
    // A rejected query is a device that does not know, not a failure to show
    // the user anything.
    platformSays(Promise.reject(new Error('no accessibility service')));

    await open();

    expect(screen.getByText(FULL)).toBeOnTheScreen();
  });

  it('stops listening once the blob using it is gone', async () => {
    removed.mockClear();
    platformSays(false);
    await open();

    screen.unmount();

    expect(removed).toHaveBeenCalled();
  });
});
