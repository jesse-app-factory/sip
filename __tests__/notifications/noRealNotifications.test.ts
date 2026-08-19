/**
 * docs/testing-strategy.md: "No test schedules a real notification or requests
 * a real permission." And docs/functional-spec.md, "Data": "There is no
 * account, no synchronisation, and no network request anywhere in the
 * application."
 *
 * Both are properties of whole directories rather than of any one test, so
 * they are asserted the way `__tests__/domain/purity.test.ts` and
 * `__tests__/storage/noAsyncStorage.test.ts` assert theirs — by reading the
 * sources. Running a test can only show that it passed against the fake; it
 * cannot show that no code path anywhere reaches the device or the network.
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
const EXPO_NOTIFICATIONS = ['expo', 'notifications'].join('-');

const NOTIFICATIONS = `${__dirname}/../../src/notifications`;
const NOTIFICATION_TESTS = __dirname;
const SCREEN_TESTS = `${__dirname}/../screens`;
const SOURCES = `${__dirname}/../../src`;

/** The single file allowed to import the device notification package. */
const ADAPTER = 'notifications/expoScheduler.ts';

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

const read = (file: string): string => fs.readFileSync(file, 'utf8');

const notifications = sourceFiles(NOTIFICATIONS);
const tests = [...sourceFiles(NOTIFICATION_TESTS), ...sourceFiles(SCREEN_TESTS)];
const sources = sourceFiles(SOURCES);

describe('scheduling', () => {
  it('is an interface, with a real implementation and a fake', () => {
    const port = read(`${NOTIFICATIONS}/reminderScheduler.ts`);
    const real = read(`${NOTIFICATIONS}/expoScheduler.ts`);
    const fake = read(`${NOTIFICATIONS}/fakeScheduler.ts`);

    expect(port).toMatch(/export interface ReminderScheduler \{/);
    // Both build the same interface, so what a test asserts against the fake
    // is what the device implementation is obliged to do.
    expect(real).toMatch(/\):\s*ReminderScheduler \{/);
    expect(fake).toMatch(/\):\s*FakeReminderScheduler \{/);
    expect(fake).toMatch(/export interface FakeReminderScheduler extends ReminderScheduler/);
  });

  it('reaches the device notification package from exactly one file', () => {
    const importers = sources.filter((file) =>
      importedModules(read(file)).includes(EXPO_NOTIFICATIONS),
    );

    expect(importers.map((file) => file.slice(file.indexOf('/src/') + 5))).toEqual([ADAPTER]);
  });

  it('decides when a reminder is due without reading the clock', () => {
    // The moment is always a parameter, so a reminder time is arithmetic a
    // test can assert rather than whenever the suite ran.
    for (const file of notifications) {
      expect(read(file)).not.toMatch(/\bDate\.now\s*\(/);
      expect(read(file)).not.toMatch(/\bnew\s+Date\s*\(\s*\)/);
    }
  });
});

describe('the notification and screen tests', () => {
  it('are there to be checked', () => {
    expect(tests.length).toBeGreaterThan(1);
  });

  it.each(tests)('%s imports neither the device package nor its adapter', (file) => {
    for (const specifier of importedModules(read(file))) {
      expect(specifier).not.toBe(EXPO_NOTIFICATIONS);
      expect(specifier).not.toMatch(/notifications\/expoScheduler$/);
    }
  });

  it.each(tests)('%s never builds the device scheduler', (file) => {
    // The barrel re-exports the device factory, so not importing the adapter
    // is not on its own enough: nothing here may call it either.
    expect(read(file)).not.toMatch(/createExpo[A-Za-z]*Scheduler\(/);
  });

  it('do build schedulers, in the fake', () => {
    const users = tests.filter((file) => /createFakeReminderScheduler\(/.test(read(file)));

    expect(users.length).toBeGreaterThan(2);
  });
});

describe('the application', () => {
  // The vocabulary of a network request. `expo-notifications`' own push-token
  // calls are in the list because they are the one way this app could reach a
  // server without ever writing a URL, and the reason the repository needs no
  // credential of any kind — see docs/technical-spec.md, "Notifications".
  const NETWORK = [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /\bEventSource\b/,
    /https?:\/\//,
    /PushTokenAsync/,
    /registerForPushNotifications/,
    /subscribeToTopicAsync/,
  ];

  it.each(sources)('%s makes no network request', (file) => {
    const source = read(file);

    for (const pattern of NETWORK) {
      expect(source).not.toMatch(pattern);
    }
  });
});
