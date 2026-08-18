import { render, screen } from '@testing-library/react-native';

import App from '../App';

describe('App', () => {
  it('renders the placeholder screen without throwing', () => {
    expect(() => render(<App />)).not.toThrow();
  });

  it('shows the placeholder copy', () => {
    render(<App />);

    expect(screen.getByText('Sip')).toBeOnTheScreen();
  });
});
