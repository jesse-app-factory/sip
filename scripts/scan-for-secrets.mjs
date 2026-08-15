#!/usr/bin/env node
// GENERATED FILE — DO NOT EDIT.
//
// Fails CI when a credential-shaped value is committed to the repository.
//
// Bundled from packages/agent-contract by `pnpm --filter @factory/agent-contract build:bundle`.
// Edit the TypeScript source there; a test fails if this file drifts from it.
//
// Runs inside a generated repository, so it is bundled dependency-free rather
// than installed.

// src/cli/scanSecretsEntry.ts
import process2 from "node:process";

// src/cli/scanSecretsCli.ts
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

// src/scanForSecrets.ts
var SCAN_PATTERNS = [
  { name: "Anthropic key or OAuth token", pattern: /sk-ant-[A-Za-z0-9_-]{12,}/ },
  { name: "GitHub token", pattern: /gh[porsu]_[A-Za-z0-9]{20,}/ },
  { name: "GitHub fine-grained token", pattern: /github_pat_[A-Za-z0-9_]{20,}/ },
  {
    name: "Discord webhook URL",
    pattern: /https?:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]{8,}/i
  }
];
var PEM_HEADER = /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/;
var PEM_BODY = /[A-Za-z0-9+/]{40,}={0,2}\s*$/;
var ALLOW_MARKER = "factory:allow-secret-example";
function scanForSecrets(files) {
  const findings = [];
  for (const file of files) {
    const lines = file.content.split("\n");
    for (const [index, line] of lines.entries()) {
      if (line.includes(ALLOW_MARKER)) continue;
      if (PEM_HEADER.test(line) && lines.slice(index + 1, index + 4).some((next) => PEM_BODY.test(next))) {
        findings.push({ path: file.path, line: index + 1, kind: "Private key block" });
        continue;
      }
      for (const { name, pattern } of SCAN_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({ path: file.path, line: index + 1, kind: name });
          break;
        }
      }
    }
  }
  return findings;
}
function renderFindings(findings) {
  if (findings.length === 0) return "No credentials found.";
  return [
    `${findings.length} possible credential(s) found:`,
    "",
    ...findings.map((finding) => `- ${finding.path}:${finding.line} \u2014 ${finding.kind}`),
    "",
    "If one is a deliberate example, put the marker below on that line; anything",
    "else must be removed from the repository AND rotated, because the history",
    "keeps it even after the file changes.",
    "",
    `  ${ALLOW_MARKER}`
  ].join("\n");
}

// src/cli/scanSecretsCli.ts
var SKIP_EXTENSIONS = /* @__PURE__ */ new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".woff",
  ".woff2",
  ".ttf"
]);
var MAX_BYTES = 512 * 1024;
function scannableFiles(repoRoot) {
  try {
    return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"]
    }).split("\n").map((line) => line.trim()).filter((line) => line !== "");
  } catch {
    return [];
  }
}
function main(repoRoot = process.cwd()) {
  const files = [];
  for (const relative of scannableFiles(repoRoot)) {
    if (SKIP_EXTENSIONS.has(path.extname(relative).toLowerCase())) continue;
    const absolute = path.join(repoRoot, relative);
    try {
      if (statSync(absolute).size > MAX_BYTES) continue;
      files.push({ path: relative, content: readFileSync(absolute, "utf8") });
    } catch {
    }
  }
  const findings = scanForSecrets(files);
  const report = renderFindings(findings);
  process.stdout.write(`${report}
`);
  if (findings.length > 0) {
    process.stderr.write("::error::Credential-shaped values are committed to this repository.\n");
    return 1;
  }
  process.stdout.write(`Scanned ${files.length} file(s).
`);
  return 0;
}

// src/cli/scanSecretsEntry.ts
process2.exitCode = main();
