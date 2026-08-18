/**
 * docs/technical-spec.md: "Nothing under `src/domain/` may import React, React
 * Native, or any storage or platform module. It is plain TypeScript operating
 * on plain values."
 *
 * That is a property of the whole directory rather than of any one function,
 * so it is asserted by reading the sources: every import must be relative, and
 * nothing may reach for the clock.
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

const DOMAIN = `${__dirname}/../../src/domain`;

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

const files = sourceFiles(DOMAIN);

describe('the domain layer', () => {
  it('has sources to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s imports nothing outside the domain', (file) => {
    for (const specifier of importedModules(fs.readFileSync(file, 'utf8'))) {
      expect(specifier).toMatch(/^\.{1,2}\//);
    }
  });

  it.each(files)('%s imports no React, storage or platform module', (file) => {
    for (const specifier of importedModules(fs.readFileSync(file, 'utf8'))) {
      expect(specifier).not.toMatch(
        /^(react|react-dom|react-native|expo|@react-native|@expo|@testing-library)/,
      );
    }
  });

  it.each(files)('%s does not read the clock', (file) => {
    const source = fs.readFileSync(file, 'utf8');

    // A moment is always a parameter, so the day-rollover rules stay testable.
    expect(source).not.toMatch(/\bDate\.now\s*\(/);
    expect(source).not.toMatch(/\bnew\s+Date\s*\(\s*\)/);
  });
});
