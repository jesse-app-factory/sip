import { render, screen } from '@testing-library/react-native';
import Animated from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

/**
 * TASK-001 exists to prove the toolchain works before anything depends on it.
 * Reanimated and Svg both resolve to native modules on a device; these assert
 * they still render under Jest, where there is neither device nor simulator.
 */
describe('the test environment', () => {
  it('renders a reanimated view', () => {
    render(<Animated.View testID="animated" />);

    expect(screen.getByTestId('animated')).toBeTruthy();
  });

  it('renders vector art', () => {
    render(
      <Svg testID="svg">
        <Circle cx={10} cy={10} r={5} />
      </Svg>
    );

    expect(screen.getByTestId('svg')).toBeTruthy();
  });
});
