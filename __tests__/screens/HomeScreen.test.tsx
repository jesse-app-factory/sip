import { render, screen } from '@testing-library/react-native';

import App from '../../App';
import HomeScreen from '../../src/screens/HomeScreen';

describe('HomeScreen', () => {
  it('renders without throwing', () => {
    expect(() => render(<HomeScreen />)).not.toThrow();
  });

  it('shows the placeholder content', () => {
    render(<HomeScreen />);

    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.getByText('Sip')).toBeTruthy();
  });

  it('is what the app renders', () => {
    render(<App />);

    expect(screen.getByTestId('home-screen')).toBeTruthy();
  });
});
