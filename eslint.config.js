// eslint-config-expo is the template's config, but it pulls in enough of a
// dependency tree to push the branch past its changed-line budget, so the
// project lints TypeScript directly with typescript-eslint instead.
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    // dist/ is build output; scripts/ belongs to the factory harness and is not
    // part of the application, nor a path this project's tasks may modify.
    ignores: ['dist/**', 'scripts/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [...tseslint.configs.recommended],
  },
);
