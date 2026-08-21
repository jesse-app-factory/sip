/**
 * The composition root, rendered as the phone would render it.
 *
 * What onboarding does and when it appears is asserted against the in-memory
 * storage in `screens/OnboardingScreen.test.tsx` and
 * `navigation/FirstRunGate.test.tsx`. This suite covers only what those cannot:
 * that `App` wires the real implementations together without throwing, and that
 * a launch with nothing stored opens on onboarding rather than on the app.
 *
 * `jest.setup.js` registers the mock AsyncStorage ships for exactly this, so no
 * device store is reached here either.
 */
import { render, screen } from '@testing-library/react-native';

import App from '../App';
import { FIRST_RUN_LOADING_MESSAGE } from '../src/navigation';
import { ONBOARDING_TITLE, SKIP_LABEL } from '../src/screens';

/** Lets the read of the record settle inside the test rather than after it. */
const settle = (): Promise<unknown> => screen.findByText(ONBOARDING_TITLE);

describe('App', () => {
  it('renders without throwing', async () => {
    expect(() => render(<App />)).not.toThrow();

    await settle();
  });

  it('shows the app name', async () => {
    render(<App />);

    expect(screen.getByText('Sip')).toBeOnTheScreen();

    await settle();
  });

  it('waits for the record of first run before showing a screen', async () => {
    render(<App />);

    expect(screen.getByText(FIRST_RUN_LOADING_MESSAGE)).toBeOnTheScreen();

    await settle();
  });

  it('opens on onboarding, with a way to skip it', async () => {
    render(<App />);

    expect(await screen.findByText(ONBOARDING_TITLE)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: SKIP_LABEL })).toBeOnTheScreen();
  });
});
