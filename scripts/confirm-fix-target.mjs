#!/usr/bin/env node
// GENERATED FILE — DO NOT EDIT.
//
// Re-reads the target immediately before the paid step and stands the run down if it changed.
//
// Bundled from packages/fix by `pnpm --filter @factory/fix build:bundle`.
// Edit the TypeScript source there; a test fails if this file drifts from it.
//
// Runs inside a generated repository, so it is bundled dependency-free rather
// than installed.

// src/cli/confirmTargetEntry.ts
import process3 from "node:process";

// src/cli/confirmTargetCli.ts
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process2 from "node:process";

// ../errors/dist/backoff.js
var MAX_DELAY_MS = 15 * 6e4;
function retryAfterFromHeaders(headers, now = /* @__PURE__ */ new Date()) {
  const retryAfter = Number.parseInt(headers["retry-after"] ?? "", 10);
  if (Number.isInteger(retryAfter) && retryAfter > 0)
    return retryAfter * 1e3;
  const reset = Number.parseInt(headers["x-ratelimit-reset"] ?? "", 10);
  if (Number.isInteger(reset) && reset > 0) {
    const delta = reset * 1e3 - now.getTime();
    return delta > 0 ? delta : null;
  }
  return null;
}

// ../errors/dist/retryingFetch.js
var FETCH_RETRY_DELAYS_MS = [500, 2e3, 5e3];
var MAX_RETRY_AFTER_MS = 3e4;
var defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function worthRetrying(status) {
  return status >= 500 || status === 429;
}
function createRetryingFetch(options = {}) {
  const doFetch = options.fetchImpl ?? fetch;
  const delays = options.delaysMs ?? FETCH_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? defaultSleep;
  return async function retryingFetch(input, init) {
    let lastError = null;
    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        const response = await doFetch(input, init);
        if (!worthRetrying(response.status) || attempt === delays.length)
          return response;
        const advised = retryAfterFromHeaders({
          "retry-after": response.headers.get("retry-after") ?? void 0,
          "x-ratelimit-reset": response.headers.get("x-ratelimit-reset") ?? void 0
        });
        const wait = advised !== null && advised <= MAX_RETRY_AFTER_MS ? advised : delays[attempt];
        options.onRetry?.(attempt + 1, `HTTP ${response.status}`);
        await sleep(wait);
      } catch (error) {
        lastError = error;
        if (attempt === delays.length)
          break;
        options.onRetry?.(attempt + 1, error instanceof Error ? error.message : String(error));
        await sleep(delays[attempt]);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`fetch failed after ${delays.length + 1} attempts`);
  };
}

// ../errors/dist/quota.js
var DEFAULT_QUOTA_RECHECK_MS = 60 * 6e4;

// src/fixClient.ts
function toPullRequest(raw) {
  return {
    number: raw.number,
    headRef: raw.head.ref,
    headSha: raw.head.sha,
    state: raw.state === "open" ? "open" : "closed",
    draft: raw.draft,
    merged: raw.merged === true
  };
}
function createRestFixGitHub(options) {
  const apiUrl = options.apiUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com";
  const doFetch = options.fetchImpl ?? createRetryingFetch();
  const base = `${apiUrl}/repos/${options.owner}/${options.repo}`;
  async function request(method, path2, body) {
    const response = await doFetch(`${base}${path2}`, {
      method,
      headers: {
        authorization: `Bearer ${options.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...body === void 0 ? {} : { "content-type": "application/json" }
      },
      ...body === void 0 ? {} : { body: JSON.stringify(body) }
    });
    if (!response.ok) {
      throw new Error(`${method} ${path2} \u2192 ${response.status} ${await response.text()}`);
    }
    return response.status === 204 ? null : response.json();
  }
  return {
    async findOpenPullRequestForBranch(branch) {
      const pulls = await request(
        "GET",
        `/pulls?state=open&head=${encodeURIComponent(`${options.owner}:${branch}`)}`
      );
      const first = pulls[0];
      return first === void 0 ? null : toPullRequest(first);
    },
    async getPullRequest(pullRequestNumber) {
      return toPullRequest(await request("GET", `/pulls/${pullRequestNumber}`));
    },
    async listIssueComments(issueNumber) {
      const comments = await request("GET", `/issues/${issueNumber}/comments?per_page=100`);
      return comments.map((comment) => comment.body ?? "");
    },
    async listIssueLabels(issueNumber) {
      const labels = await request("GET", `/issues/${issueNumber}/labels`);
      return labels.map((label) => label.name);
    },
    async createComment(issueNumber, body) {
      await request("POST", `/issues/${issueNumber}/comments`, { body });
    },
    async setIssueLabels(issueNumber, add, remove) {
      if (add.length > 0) {
        await request("POST", `/issues/${issueNumber}/labels`, { labels: add });
      }
      for (const label of remove) {
        await request("DELETE", `/issues/${issueNumber}/labels/${encodeURIComponent(label)}`);
      }
    }
  };
}

// src/targetFreshness.ts
var FRESH = {
  fresh: true,
  reason: null,
  detail: "Target is unchanged since the decision."
};
function confirmTarget(facts) {
  if (facts.pullRequestState !== "open") {
    return {
      fresh: false,
      reason: "PULL_REQUEST_NOT_OPEN",
      detail: facts.merged === true ? "The pull request merged after the fix was decided; there is nothing left to repair." : "The pull request closed after the fix was decided; there is nothing left to repair."
    };
  }
  if (facts.branchMergedIntoDefault) {
    return {
      fresh: false,
      reason: "BRANCH_ALREADY_MERGED",
      detail: "The branch is already contained in the default branch, so the work has landed even though the pull request is still open."
    };
  }
  if (facts.issueLabels.includes("agent:blocked")) {
    return {
      fresh: false,
      reason: "ISSUE_BLOCKED",
      detail: "The issue was blocked after the fix was decided; only a human restarts it."
    };
  }
  if (facts.headSha !== facts.expectedHeadSha) {
    return {
      fresh: false,
      reason: "HEAD_MOVED",
      detail: `The branch moved from ${facts.expectedHeadSha} to ${facts.headSha} after the fix was decided; the failure it was sent to repair may no longer exist.`
    };
  }
  return FRESH;
}

// src/cli/confirmTargetCli.ts
var CONFIRM_DECISION_FILE = ".agent/fix-target-confirmation.json";
async function main(options = {}) {
  const repoRoot = options.repoRoot ?? process2.cwd();
  const token = process2.env.GITHUB_TOKEN ?? "";
  const repository = process2.env.GITHUB_REPOSITORY ?? "";
  const [owner, repo] = repository.split("/");
  if (!token) {
    process2.stderr.write("GITHUB_TOKEN is not set.\n");
    return 1;
  }
  if (!owner || !repo) {
    process2.stderr.write(`GITHUB_REPOSITORY is not owner/repo: "${repository}"
`);
    return 1;
  }
  mkdirSync(path.join(repoRoot, ".agent"), { recursive: true });
  const write = (decision) => {
    writeFileSync(
      path.join(repoRoot, CONFIRM_DECISION_FILE),
      `${JSON.stringify(decision, null, 2)}
`,
      "utf8"
    );
    const outputPath = process2.env.GITHUB_OUTPUT;
    if (outputPath) {
      appendFileSync(
        outputPath,
        Object.entries(decision).filter(([, value]) => typeof value !== "object").map(([key, value]) => `${key}=${String(value)}`).join("\n") + "\n"
      );
    }
    process2.stdout.write(`${JSON.stringify(decision)}
`);
    return 0;
  };
  const pullRequestNumber = Number.parseInt(process2.env.PULL_REQUEST_NUMBER ?? "", 10);
  const issueNumber = Number.parseInt(process2.env.ISSUE_NUMBER ?? "", 10);
  const expectedHeadSha = process2.env.EXPECTED_HEAD_SHA ?? "";
  if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0 || !expectedHeadSha) {
    return write({
      fresh: true,
      reason: "NOT_CHECKED",
      detail: "PULL_REQUEST_NUMBER or EXPECTED_HEAD_SHA was missing; proceeding without a check."
    });
  }
  const client = options.client ?? createRestFixGitHub({ token, owner, repo });
  const pull = await client.getPullRequest(pullRequestNumber);
  const issueLabels = Number.isInteger(issueNumber) && issueNumber > 0 ? await client.listIssueLabels(issueNumber) : [];
  const facts = {
    pullRequestState: pull.state,
    merged: pull.merged,
    headSha: pull.headSha,
    expectedHeadSha,
    branchMergedIntoDefault: process2.env.BRANCH_MERGED_INTO_DEFAULT === "true",
    issueLabels
  };
  const verdict = confirmTarget(facts);
  if (!verdict.fresh && Number.isInteger(issueNumber) && issueNumber > 0) {
    await client.createComment(
      issueNumber,
      [
        `**Fix run stood down** \u2014 \`${verdict.reason}\`.`,
        "",
        verdict.detail,
        "",
        "No agent ran and no repair attempt was recorded.",
        `<!-- factory:stood-down reason=${verdict.reason} pr=${pullRequestNumber} sha=${pull.headSha} -->`
      ].join("\n")
    );
  }
  return write({
    fresh: verdict.fresh,
    reason: verdict.reason ?? "TARGET_UNCHANGED",
    detail: verdict.detail,
    pullRequestNumber,
    issueNumber,
    expectedHeadSha,
    headSha: pull.headSha
  });
}

// src/cli/confirmTargetEntry.ts
process3.exitCode = await main();
