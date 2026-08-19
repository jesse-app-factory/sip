/**
 * docs/testing-strategy.md: "No test calls AsyncStorage."
 *
 * That is a property of a whole directory rather than of any one test, so it
 * is asserted the way `__tests__/domain/purity.test.ts` asserts the domain's
 * purity — by reading the sources. Every test in this directory reaches
 * storage through the in-memory implementation, and none of them names the
 * device package at all.
 *
 * The scope is this directory because it is the tests this task adds. The
 * suite installed by the dependency task imports the package deliberately, to
 * assert that it is installed, and calls nothing on it.
 *
 * The same reading proves the other half of the arrangement: within `src/`,
 * exactly one file imports AsyncStorage, so every other module reaches storage
 * through the interface — see docs/architecture.md.
 *
 * The file system is reached through `require` with the small shapes this
 * needs declared locally, because `@types/node` is not a dependency of this
 * project and this task may not add one.
 */
interface DirEntry {
  readonly name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

interface FileSystem {
  readdirSync(path: string, options: { withFileTypes: true }): DirEntry[];
  readFileSync(path: string, encoding: 'utf8'): string;
}

declare const require: (id: string) => unknown;
declare const __dirname: string;

const fs = require('fs') as FileSystem;

// Assembled from parts so that this file, which scans itself along with its
// neighbours, does not report itself. The scan reads import specifiers, and a
// plain string is not one — but a reader deserves to know that is deliberate.
const ASYNC_STORAGE = ['@react-native-async-storage', 'async-storage'].join('/');

const STORAGE_TESTS = __dirname;
const SOURCES = `${__dirname}/../../src`;

/** The single file allowed to import the device package. */
const ADAPTER = 'storage/asyncStorage.ts';

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const path = `${directory}/${item.name}`;

    if (item.isDirectory()) {
      return sourceFiles(path);
    }

    return item.isFile() && /\.tsx?$/.test(item.name) ? [path] : [];
  });
}

/** `import ... from 'x'`, `export ... from 'x'`, `require('x')`, `import('x')`. */
function importedModules(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

const tests = sourceFiles(STORAGE_TESTS);
const sources = sourceFiles(SOURCES);

describe('the storage tests', () => {
  it('are there to be checked', () => {
    expect(tests.length).toBeGreaterThan(1);
  });

  it.each(tests)('%s imports neither AsyncStorage nor its adapter', (file) => {
    for (const specifier of importedModules(fs.readFileSync(file, 'utf8'))) {
      expect(specifier).not.toBe(ASYNC_STORAGE);
      expect(specifier).not.toMatch(/asyncStorage$/);
    }
  });

  it.each(tests)('%s never builds storage on the device', (file) => {
    // The barrel re-exports the device factories, so not importing the adapter
    // is not on its own enough: nothing here may call them either.
    expect(fs.readFileSync(file, 'utf8')).not.toMatch(/createAsyncStorage[A-Za-z]*\(/);
  });

  it('do build storage in memory', () => {
    const users = tests.filter((file) =>
      /createInMemory(HydrationStorage|KeyValueStore)\(/.test(fs.readFileSync(file, 'utf8')),
    );

    expect(users.length).toBe(tests.length - 1); // every suite but this one
  });
});

describe('the application sources', () => {
  it('reach the device store from exactly one file', () => {
    const importers = sources.filter((file) =>
      importedModules(fs.readFileSync(file, 'utf8')).includes(ASYNC_STORAGE),
    );

    expect(importers.map((file) => file.slice(file.indexOf('/src/') + 5))).toEqual([ADAPTER]);
  });
});
