#!/usr/bin/env node
// Runs the project's CI checks and writes the machine-readable result file the
// factory's review and fix workflows consume (plan doc §10, Step MVP-3.2).
//
// Dependency-free and self-contained on purpose: it runs inside a generated
// repository whose dependencies are the target project's, not the factory's.
//
// Usage: node scripts/run-ci-checks.mjs [--manifest project-manifest.json]
//                                       [--output ci-result.json]
// Exits 0 when every required check passed, 1 otherwise.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const CHECK_ORDER = ["lint", "typecheck", "test", "integration", "build"];

function parseArgs(argv) {
  const args = { manifest: "project-manifest.json", output: "ci-result.json" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--manifest") args.manifest = argv[++i];
    else if (argv[i] === "--output") args.output = argv[++i];
    else if (argv[i] === "--cwd") args.cwd = argv[++i];
  }
  return args;
}

/** Node.js only by design; anything else stops with an actionable message. */
export function detectEcosystem(dir) {
  if (!existsSync(path.join(dir, "package.json"))) {
    return {
      ok: false,
      message:
        "No package.json found. This factory currently supports Node.js projects only. " +
        "Add a package.json, or extend scripts/run-ci-checks.mjs for this ecosystem."
    };
  }

  if (existsSync(path.join(dir, "pnpm-lock.yaml"))) {
    return {
      ok: true,
      packageManager: "pnpm",
      installCommand: ["pnpm", "install", "--frozen-lockfile"]
    };
  }
  if (existsSync(path.join(dir, "package-lock.json"))) {
    return { ok: true, packageManager: "npm", installCommand: ["npm", "ci"] };
  }
  if (existsSync(path.join(dir, "yarn.lock"))) {
    return {
      ok: true,
      packageManager: "yarn",
      installCommand: ["yarn", "install", "--frozen-lockfile"]
    };
  }

  return {
    ok: false,
    message:
      "No lockfile found (expected pnpm-lock.yaml, package-lock.json, or yarn.lock). " +
      "Commit a lockfile so dependency installation is reproducible."
  };
}

function readManifest(manifestPath) {
  if (!existsSync(manifestPath)) {
    return { ok: false, message: `Manifest not found at ${manifestPath}.` };
  }
  try {
    return { ok: true, manifest: JSON.parse(readFileSync(manifestPath, "utf8")) };
  } catch (error) {
    return { ok: false, message: `Manifest is not valid JSON: ${error.message}` };
  }
}

function scriptExists(dir, scriptName) {
  const packageJsonPath = path.join(dir, "package.json");
  if (!existsSync(packageJsonPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    return typeof pkg.scripts?.[scriptName] === "string";
  } catch {
    return false;
  }
}

function runCheck({ name, script, packageManager, dir }) {
  const command = `${packageManager} run ${script}`;

  if (!scriptExists(dir, script)) {
    return {
      name,
      status: "failed",
      command,
      summary:
        `Required check "${name}" is enabled in project-manifest.json but package.json ` +
        `defines no "${script}" script. Add the script, or set commands.${name}.enabled ` +
        `to false in project-manifest.json if this project genuinely has no ${name} step.`
    };
  }

  const result = spawnSync(packageManager, ["run", script], {
    cwd: dir,
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  process.stdout.write(`\n--- ${name}: ${command} ---\n${output}\n`);

  const passed = result.status === 0;
  return {
    name,
    status: passed ? "passed" : "failed",
    command,
    summary: passed ? `${name} passed` : summarizeFailure(output, result.status)
  };
}

function summarizeFailure(output, exitCode) {
  const lines = output.split(/\r?\n/).filter((line) => line.trim() !== "");
  const tail = lines.slice(-5).join(" | ");
  return `exited with code ${exitCode ?? "null"}${tail ? `: ${tail}` : ""}`;
}

const STATUS_ICONS = { passed: "✅", failed: "❌", skipped: "⏭️" };

/**
 * Appends a markdown table to the GitHub Actions job summary. Done here rather
 * than with an inline `node -e` in the workflow, which would put JS template
 * literals inside shell quotes — unreadable, and shellcheck rightly flags it.
 */
export function renderSummary(result) {
  const rows = result.checks
    .map((check) => {
      const icon = STATUS_ICONS[check.status] ?? "";
      const summary = String(check.summary).replaceAll("|", "\\|").slice(0, 300);
      return `| ${icon} ${check.name} | ${check.status} | \`${check.command}\` | ${summary} |`;
    })
    .join("\n");

  return [
    `## CI result: ${result.status}`,
    "",
    `Commit \`${result.commitSha}\``,
    "",
    "| Check | Status | Command | Summary |",
    "| --- | --- | --- | --- |",
    rows,
    ""
  ].join("\n");
}

function publishSummary(result) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  try {
    appendFileSync(summaryPath, `${renderSummary(result)}\n`);
  } catch (error) {
    // A summary is a nice-to-have; never fail the build over it.
    process.stderr.write(`Could not write job summary: ${error.message}\n`);
  }
}

function finish(workingDir, outputFile, result) {
  writeFileSync(path.join(workingDir, outputFile), `${JSON.stringify(result, null, 2)}\n`);
  publishSummary(result);
  return result.status === "passed" ? 0 : 1;
}

export function main(argv, dir) {
  const args = parseArgs(argv);
  const workingDir = args.cwd ?? dir;

  const ecosystem = detectEcosystem(workingDir);
  if (!ecosystem.ok) {
    const result = {
      status: "failed",
      checks: [
        {
          name: "ecosystem",
          status: "failed",
          command: "detect-ecosystem",
          summary: ecosystem.message
        }
      ],
      commitSha: process.env.GITHUB_SHA ?? "unknown"
    };
    process.stderr.write(`${ecosystem.message}\n`);
    return finish(workingDir, args.output, result);
  }

  const manifestResult = readManifest(path.join(workingDir, args.manifest));
  if (!manifestResult.ok) {
    const result = {
      status: "failed",
      checks: [
        {
          name: "manifest",
          status: "failed",
          command: "read-manifest",
          summary: manifestResult.message
        }
      ],
      commitSha: process.env.GITHUB_SHA ?? "unknown"
    };
    process.stderr.write(`${manifestResult.message}\n`);
    return finish(workingDir, args.output, result);
  }

  const commands = manifestResult.manifest.commands ?? {};
  const checks = [];

  for (const name of CHECK_ORDER) {
    const config = commands[name];
    if (!config || config.enabled !== true) {
      checks.push({
        name,
        status: "skipped",
        command: `${ecosystem.packageManager} run ${config?.script ?? name}`,
        summary: "disabled in project-manifest.json"
      });
      continue;
    }

    // Every enabled check runs even after an earlier failure, so one broken
    // step does not hide the rest of the report.
    checks.push(
      runCheck({
        name,
        script: config.script,
        packageManager: ecosystem.packageManager,
        dir: workingDir
      })
    );
  }

  const failed = checks.filter((check) => check.status === "failed");
  const result = {
    status: failed.length === 0 ? "passed" : "failed",
    checks,
    commitSha: process.env.GITHUB_SHA ?? "unknown"
  };

  process.stdout.write(`\nWrote ${args.output} (status: ${result.status})\n`);

  return finish(workingDir, args.output, result);
}

// Only auto-run as a CLI, so tests can import detectEcosystem/main directly.
// pathToFileURL keeps this correct on Windows, where a bare `file://` + path
// string does not match import.meta.url's `file:///C:/...` form.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), process.cwd());
}
