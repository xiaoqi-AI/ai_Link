#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const outputJson = args.includes("--json");
const force = args.includes("--force");
const print = args.includes("--print");
const outputPath = valueAfter("--output") || "runtime/private/github-auth-adapter.mjs";
const resolvedOutput = path.resolve(process.cwd(), outputPath);
const privateRoot = path.resolve(process.cwd(), "runtime", "private");
const relativeOutput = path.relative(process.cwd(), resolvedOutput).replaceAll("\\", "/");

const report = buildReport();

if (!print && report.summary.ok) {
  mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, adapterTemplate(), { encoding: "utf8", flag: force ? "w" : "wx" });
  report.summary.written = true;
}

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

function buildReport() {
  const blockers = [];
  if (!isInside(resolvedOutput, privateRoot)) {
    blockers.push("Output path must stay under runtime/private.");
  }
  if (![".mjs", ".js"].includes(path.extname(resolvedOutput))) {
    blockers.push("Output file extension must be .mjs or .js.");
  }
  if (!force && existsSync(resolvedOutput) && !print) {
    blockers.push("Output file already exists. Rerun with --force only after reviewing the existing private file.");
  }
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      ok: blockers.length === 0,
      written: false,
      printOnly: print,
      output: relativeOutput,
      blockingCount: blockers.length,
      recommendedNext: blockers.length
        ? "Resolve the listed blockers, then rerun this generator."
        : "Set GH_TOKEN or GITHUB_TOKEN only in the current terminal, point AI_LINK_PRIVATE_CONNECTOR_MODULE to the generated file, then run a github/check_auth task."
    },
    output: {
      path: relativeOutput,
      privateRoot: "runtime/private"
    },
    blockers,
    commands: [
      "$env:GH_TOKEN=\"<fine-grained-readonly-token-or-session-token>\"",
      `$env:AI_LINK_PRIVATE_CONNECTOR_MODULE=\"${relativeOutput}\"`,
      "npm run auth-hub:executor:start"
    ],
    safety: [
      "The generated file is written under runtime/private and must not be committed.",
      "The adapter reads GH_TOKEN or GITHUB_TOKEN from the current process only; it never writes token values.",
      "repo_read, actions_read and pull_request_read use separate GET-only endpoints that require Contents, Actions and Pull requests read permission respectively.",
      "Use a reviewed non-critical private repository for a live scope acceptance check because public repository endpoints may also be readable without authentication.",
      "The adapter only performs a GitHub authorization health check and does not merge PRs, change repository settings, or dispatch provider-live workflows."
    ]
  };
}

function adapterTemplate() {
  return `const GITHUB_API = "https://api.github.com";

export async function createPrivateConnectors() {
  return {
    github: {
      mode: "private",
      checkAuth: async ({ owner = "", repo = "", scope = "repo_read" } = {}) => checkGitHubAuth({ owner, repo, scope })
    }
  };
}

async function checkGitHubAuth({ owner, repo, scope }) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
  const checkedAt = new Date().toISOString();
  if (!token) {
    return result({
      status: "needs_action",
      sessionState: "missing",
      checkedAt,
      code: "credential_missing"
    });
  }

  const endpoint = endpointFor({ owner, repo, scope });
  if (!endpoint) {
    return result({
      status: "needs_action",
      sessionState: "blocked",
      checkedAt,
      code: "connector_contract_failed"
    });
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        authorization: \`Bearer \${token}\`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "ai-link-auth-health"
      },
      signal: AbortSignal.timeout(Number(process.env.AI_LINK_GITHUB_AUTH_TIMEOUT_MS || 15000))
    });
  } catch {
    return result({
      status: "needs_action",
      sessionState: "blocked",
      checkedAt,
      code: "platform_unavailable"
    });
  }

  if (response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0") {
    return result({
      status: "needs_action",
      sessionState: "valid",
      checkedAt,
      code: "platform_rate_limited",
      retryAfterSeconds: retryAfterSeconds(response)
    });
  }
  if ([401, 403, 404].includes(response.status)) {
    return result({
      status: "needs_action",
      sessionState: "blocked",
      checkedAt,
      code: "credential_invalid"
    });
  }
  if (response.status >= 500) {
    return result({
      status: "needs_action",
      sessionState: "blocked",
      checkedAt,
      code: "platform_unavailable"
    });
  }
  if (!response.ok) {
    return result({
      status: "needs_action",
      sessionState: "blocked",
      checkedAt,
      code: "platform_unavailable"
    });
  }

  return result({
    status: "ready",
    sessionState: "valid",
    checkedAt
  });
}

function endpointFor({ owner, repo, scope }) {
  if (!owner || !repo) return "";
  const repository = \`\${GITHUB_API}/repos/\${encodeURIComponent(owner)}/\${encodeURIComponent(repo)}\`;
  if (scope === "repo_read") return \`\${repository}/branches?per_page=1\`;
  if (scope === "actions_read") return \`\${repository}/actions/runs?per_page=1\`;
  if (scope === "pull_request_read") return \`\${repository}/pulls?state=all&per_page=1\`;
  return "";
}

function result({ status, sessionState, checkedAt, code = "", retryAfterSeconds = 0 }) {
  return {
    schema_version: "1",
    platform: "github",
    operation: "check_auth",
    status,
    session: {
      state: sessionState,
      checked_at: checkedAt
    },
    items: [],
    action_required: status === "ready" ? null : { code },
    diagnostics: {
      item_count: 0,
      ...(retryAfterSeconds ? { retry_after_seconds: retryAfterSeconds } : {})
    }
  };
}

function retryAfterSeconds(response) {
  const retryAfter = Number(response.headers.get("retry-after") || 0);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(Math.floor(retryAfter), 86400);
  const reset = Number(response.headers.get("x-ratelimit-reset") || 0);
  if (Number.isFinite(reset) && reset > 0) return Math.min(Math.max(Math.floor(reset - Date.now() / 1000), 0), 86400);
  return 0;
}
`;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# GitHub Private Auth Adapter Scaffold");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push(`- Output: ${report.output.path}`);
  lines.push(`- Print only: ${report.summary.printOnly ? "yes" : "no"}`);
  lines.push(`- Written: ${report.summary.written ? "yes" : "no"}`);
  lines.push(`- Blocking count: ${report.summary.blockingCount}`);
  lines.push(`- Recommended next: ${report.summary.recommendedNext}`);
  lines.push("");
  if (report.blockers.length) {
    lines.push("## Blockers");
    lines.push("");
    for (const blocker of report.blockers) lines.push(`- ${blocker}`);
    lines.push("");
  }
  lines.push("## Commands");
  lines.push("");
  lines.push("```powershell");
  lines.push(...report.commands);
  lines.push("```");
  lines.push("");
  lines.push("## Safety");
  lines.push("");
  for (const item of report.safety) lines.push(`- ${item}`);
  return `${lines.join("\n")}\n`;
}

function valueAfter(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] || "";
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}
