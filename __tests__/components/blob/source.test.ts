/**
 * Two properties of the blob that a render cannot show.
 *
 * "It holds no state, reads no storage, and knows nothing about water — which
 * is what makes it testable and what stops it becoming the place where logic
 * accidentally lives." A component can be rendered a hundred times without
 * demonstrating that no code path in it reaches for storage, and a passing
 * render says nothing about what props exist beside the two that were passed.
 * Both are properties of the sources, so both are asserted by reading them —
 * the way `__tests__/domain/purity.test.ts` and
 * `__tests__/screens/storageInterface.test.ts` assert theirs.
 *
 * The tests in this directory are scanned alongside the component, because
 * the criterion is that *no* file in this task imports from those modules: a
 * blob whose own tests reach into the domain has moved the coupling rather
 * than removed it.
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

const BLOB = `${__dirname}/../../../src/components/blob`;
const BLOB_TESTS = __dirname;

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

const sources = sourceFiles(BLOB);
const tests = sourceFiles(BLOB_TESTS);
const files = [...sources, ...tests];

describe('the blob', () => {
  it('has sources and tests to check', () => {
    expect(sources.length).toBeGreaterThan(0);
    expect(tests.length).toBeGreaterThan(0);
  });

  it.each(files)('%s imports nothing from storage or the domain', (file) => {
    for (const specifier of importedModules(fs.readFileSync(file, 'utf8'))) {
      expect(specifier).not.toMatch(/(^|\/)(domain|storage)(\/|$)/);
      expect(specifier).not.toMatch(/^@react-native-async-storage/);
    }
  });

  it.each(sources)('%s holds no state', (file) => {
    const source = fs.readFileSync(file, 'utf8');

    // Anything the blob needs to know is passed in. A hook here would be the
    // beginning of the blob deciding something for itself.
    expect(source).not.toMatch(/\buse(State|Reducer|Effect|Ref|Context|Memo)\b/);
  });

  it.each(sources)('%s is neither random nor time-dependent', (file) => {
    const source = fs.readFileSync(file, 'utf8');

    expect(source).not.toMatch(/\bMath\.random\s*\(/);
    expect(source).not.toMatch(/\bDate\.now\s*\(/);
    expect(source).not.toMatch(/\bnew\s+Date\b/);
    expect(source).not.toMatch(/\bperformance\.now\s*\(/);
  });
});

describe('the props', () => {
  const source = fs.readFileSync(`${BLOB}/Blob.tsx`, 'utf8');

  /** The property names declared by `interface BlobProps { ... }`. */
  function declaredProps(): string[] {
    const block = /export interface BlobProps \{([\s\S]*?)\n\}/.exec(source);
    expect(block).not.toBeNull();

    return [...(block as RegExpExecArray)[1].matchAll(/^\s*readonly (\w+)\??:/gm)].map(
      (match) => match[1],
    );
  }

  it('are progress and mood, and nothing else', () => {
    expect(declaredProps()).toEqual(['progress', 'mood']);
  });

  it('are both required, so nothing is left to a default', () => {
    expect(source).not.toMatch(/readonly (progress|mood)\?:/);
  });

  it('are all the component takes', () => {
    // The signature destructures exactly the two declared props, so there is
    // no rest parameter quietly spreading further input into the SVG.
    expect(source).toMatch(
      /export function Blob\(\{\s*progress,\s*mood,?\s*\}: BlobProps\)/,
    );
  });
});
