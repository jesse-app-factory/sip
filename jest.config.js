/**
 * The `jest-expo` preset supplies the React Native transform, the module name
 * mapping for assets, and the `transformIgnorePatterns` that let the Expo and
 * React Native packages through Babel. Tests run in Node against the React
 * Native mocks the preset installs, so no device, simulator or emulator is
 * involved.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'jest-expo',
  // `react-native-reanimated` v4 loads through `react-native-worklets`, whose
  // `.native` implementation calls into a TurboModule that does not exist under
  // Jest. The resolver the package ships for exactly this case picks its
  // non-native implementation instead, so importing Reanimated works in tests.
  resolver: 'react-native-worklets/jest/resolver.js',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // `__tests__/` mirrors `src/`, per docs/technical-spec.md.
  testMatch: ['<rootDir>/__tests__/**/*.test.[jt]s?(x)'],
  clearMocks: true,
};
