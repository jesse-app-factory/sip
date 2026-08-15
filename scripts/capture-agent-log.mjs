#!/usr/bin/env node
// GENERATED FILE — DO NOT EDIT.
//
// Copies the Claude action's execution log into the artifact, with credentials removed.
//
// Bundled from packages/agent-contract by `pnpm --filter @factory/agent-contract build:bundle`.
// Edit the TypeScript source there; a test fails if this file drifts from it.
//
// Runs inside a generated repository, so it is bundled dependency-free rather
// than installed.

// src/cli/redactLogEntry.ts
import process2 from "node:process";

// src/cli/redactLogCli.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

// src/redactSecrets.ts
var REDACTED = "[REDACTED]";
var withWrapping = (prefix, body = "A-Za-z0-9_-") => new RegExp(`${prefix}(?:[${body}]|\\s+(?=[${body}]))*`, "g");
var SECRET_PATTERNS = [
  // Anthropic keys and OAuth tokens: sk-ant-api…, sk-ant-oat01-…
  withWrapping("sk-ant-"),
  // GitHub tokens: ghp_, gho_, ghs_, ghu_, ghr_ and fine-grained PATs
  withWrapping("gh[porsu]_"),
  withWrapping("github_pat_"),
  // Anything presented as a bearer credential, whatever its shape
  withWrapping("Bearer\\s+"),
  // Discord webhook URLs. The path's second segment is a bearer token in all
  // but name: anyone holding the URL can post as that webhook. A failed POST
  // that echoes its own target — exactly how the MVP-6 token leaked — would
  // otherwise publish it.
  /https?:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+/gi
];
var SENSITIVE_FIELDS = /("?(?:authorization|x-api-key|anthropic[-_]api[-_]key|claude_code_oauth_token|github_token|token|password|secret)"?\s*[:=]\s*")([^"]*)(")/gi;
function redactSecrets(text) {
  let redacted = text.replace(SENSITIVE_FIELDS, `$1${REDACTED}$3`);
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED);
  }
  return redacted;
}
function containsSecret(text) {
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

// src/cli/redactLogCli.ts
var EXECUTION_LOG_FILE = ".agent/claude-execution.json";
function main(repoRoot = process.cwd()) {
  const source = process.env.EXECUTION_FILE ?? "";
  const target = path.join(repoRoot, EXECUTION_LOG_FILE);
  mkdirSync(path.dirname(target), { recursive: true });
  if (source === "" || !existsSync(source)) {
    writeFileSync(
      target,
      JSON.stringify({ note: "The action produced no execution log." }, null, 2),
      "utf8"
    );
    process.stdout.write("No execution log was produced.\n");
    return 0;
  }
  const redacted = redactSecrets(readFileSync(source, "utf8"));
  if (containsSecret(redacted)) {
    writeFileSync(
      target,
      JSON.stringify(
        { note: "Execution log withheld: redaction did not remove every credential-shaped value." },
        null,
        2
      ),
      "utf8"
    );
    process.stderr.write("::warning::Execution log withheld \u2014 redaction was incomplete.\n");
    return 0;
  }
  writeFileSync(target, redacted, "utf8");
  process.stdout.write(`Captured ${redacted.length} bytes of execution log (redacted).
`);
  return 0;
}

// src/cli/redactLogEntry.ts
process2.exitCode = main();
