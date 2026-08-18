// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // `scripts/` holds the factory's own bundled tooling, which this repository
    // must not modify; linting it would report thousands of unfixable problems.
    ignores: ['dist/*', 'scripts/*'],
  },
]);
