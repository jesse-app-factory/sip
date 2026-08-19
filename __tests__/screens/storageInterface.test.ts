/**
 * "The screen reads and writes through the storage interface rather than
 * touching AsyncStorage itself."
 *
 * That is a property of the whole directory rather than of any one render, so
 * it is asserted the way `__tests__/domain/purity.test.ts` and
 * `__tests__/storage/noAsyncStorage.test.ts` assert theirs — by reading the
 * sources. Rendering a screen can only show that it works against the fake; it
 * cannot show that no code path anywhere in the file reaches for the device
 * package.
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

// Assembled from parts so that this file does not report itself: the scan
// reads import specifiers, and a plain string is not one.
const ASYNC_STORAGE = ['@react-native-async-storage', 'async-storage'].join('/');

const SCREENS = `${__dirname}/../../src/screens`;
const SCREEN_TESTS = __dirname;

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

const screens = sourceFiles(SCREENS);
const tests = sourceFiles(SCREEN_TESTS);

describe('the screens', () => {
  it('are there to be checked', () => {
    expect(screens.length).toBeGreaterThan(0);
  });

  it.each(screens)('%s imports neither AsyncStorage nor its adapter', (file) => {
    for (const specifier of importedModules(fs.readFileSync(file, 'utf8'))) {
      expect(specifier).not.toBe(ASYNC_STORAGE);
      expect(specifier).not.toMatch(/storage\/asyncStorage$/);
    }
  });

  it.each(screens)('%s never builds storage on the device', (file) => {
    // The barrel re-exports the device factories, so not importing the adapter
    // is not enough on its own: nothing here may call them either. The screen
    // is handed its storage, and the app decides which one that is.
    expect(fs.readFileSync(file, 'utf8')).not.toMatch(/createAsyncStorage[A-Za-z]*\(/);
  });

  it('takes the storage interface as a prop', () => {
    expect(fs.readFileSync(`${SCREENS}/GoalScreen.tsx`, 'utf8')).toMatch(
      /HydrationStorage[^\n]*from '\.\.\/storage'/,
    );
  });
});

describe('the screen tests', () => {
  it.each(tests)('%s reaches storage only in memory', (file) => {
    const source = fs.readFileSync(file, 'utf8');

    for (const specifier of importedModules(source)) {
      expect(specifier).not.toBe(ASYNC_STORAGE);
    }
    expect(source).not.toMatch(/createAsyncStorage[A-Za-z]*\(/);
  });
});
