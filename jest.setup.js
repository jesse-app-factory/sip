// Runs once per test file, after the test framework is installed.
//
// Importing the testing library here registers its jest matchers and the
// automatic cleanup that unmounts rendered trees after each test, so no suite
// has to remember to do either and no test can leak state into the next one.
require('@testing-library/react-native');
