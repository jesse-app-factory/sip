// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // dist/ is build output; scripts/ belongs to the factory harness and is not
    // part of the application, nor a path this project's tasks may modify.
    ignores: ['dist/*', 'scripts/*'],
  },
]);
