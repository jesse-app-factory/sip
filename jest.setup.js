/* global jest */
// Runs once per test file, after the test framework is installed. `jest` is
// ambient here, and this file is outside the lint config's test-file globs, so
// it is declared above.
//
// Importing the testing library here registers its jest matchers and the
// automatic cleanup that unmounts rendered trees after each test, so no suite
// has to remember to do either and no test can leak state into the next one.
require('@testing-library/react-native');

// AsyncStorage's native module does not exist under Jest, so the package ships a
// mock for exactly this. Registering it here — rather than in each suite — is
// what makes `docs/testing-strategy.md`'s "no test calls AsyncStorage" true by
// construction: there is no way for a test to reach the device store.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
