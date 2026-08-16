// The suite runs on CI with no device, simulator or emulator: jest-expo's preset
// supplies the React Native transforms and module mocks, so every test executes
// as plain Node. The worklets resolver keeps react-native-reanimated resolvable
// off-device.
module.exports = {
  preset: 'jest-expo',
  resolver: 'react-native-worklets/jest/resolver.js',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts', '<rootDir>/__tests__/**/*.test.tsx'],
};
