#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");

const actions = [
  {
    id: "keep-local-baseline-green",
    title: "Keep local baseline green",
    status: "ready",
    owner: "Maintainer or Codex",
    intent: "Keep the public repository safe while external Bitwarden and GitHub settings are still pending.",
    commands: [
      "npm run check",
      "npm test",
      "npm run package:check",
      "npm run package:install-smoke",
      "npm run security:scan",
      "npm run iteration:boundary",
      "npm run setup:handoff",
      "npm run verify:fresh"
    ],
    evidence: [
      "All local checks pass.",
      "Git working tree is clean before handoff.",
      "GitHub Verify check passes after push."
    ],
    secretBoundary: "No real provider key, bootstrap token, .env file, login state, or runtime/private file is needed."
  },
  {
    id: "accept-platform-readonly-p0-2",
    title: "Approve platform read-only P0.2 acceptance",
    status: "manual",
    owner: "Connector owner and account owner",
    intent: "Move the merged GitHub, WeChat, and Xiaohongshu scaffolds from public engineering confidence to operation-specific real-account evidence.",
    background: "Contracts, interactive approval, private adapter generators, combined executor entry, and operation-bound evidence checks are merged; no public artifact proves the real accounts are currently usable.",
    recommendation: "Approve GitHub read-only first, Xiaohongshu read-only second, and WeChat health third. Keep draft creation and publish outside this acceptance.",
    value: "Validates the least interactive and easiest-to-revoke platform first, then reuses the same Auth Hub evidence boundary for higher-friction accounts.",
    risk: "Real calls can consume quota, trigger platform controls, or expose account state if the local private boundary is bypassed.",
    commands: [
      "npm run auth-hub:status:json",
      "npm run auth-hub:private-bundle:print",
      "npm run auth-hub:test"
    ],
    evidence: [
      "The platform contract and private connector scaffold chain is merged into main.",
      "GitHub read-scope evidence is bound to the approved operation, scope, and target repository.",
      "The account owner approves platform, account, scope, frequency, time window, and stop conditions before any real call.",
      "A successful result records only stable operation evidence and redacted next actions."
    ],
    secretBoundary: "Credentials, cookies, QR codes, browser profiles, AppSecret values, raw platform responses, and real account identifiers stay in the local private runtime or secret manager."
  },
  {
    id: "configure-github-hardening",
    title: "Keep recorded GitHub hardening green",
    status: "ready",
    owner: "Repository maintainer",
    intent: "Preserve the approved public repository ruleset, Verify requirement, secret scanning, and push protection baseline.",
    commands: [
      "npm run github:hardening",
      "npm run github:hardening:next",
      "npm run release:manual-gates",
      "npm run github:safety:json"
    ],
    evidence: [
      "The Protect main ruleset is active and targets main.",
      "Verify is a required status check; deletion and non-fast-forward updates are restricted.",
      "Public repository secret scanning and push protection are enabled.",
      "npm run github:safety:json reports strictOk=true; requiring PRs remains intentionally deferred until external contributions begin."
    ],
    secretBoundary: "Do not paste sample secrets into GitHub issues, PRs, docs, screenshots, or test commits."
  },
  {
    id: "configure-auth-hub-remote-mock-dry-run",
    title: "Configure Auth Hub remote mock dry-run",
    status: "gated",
    owner: "Infrastructure maintainer and secret owner",
    intent: "Deploy the private console behind Cloudflare Access and verify the full mock task loop without real platform accounts.",
    background: "The deployment code, handoff, identity controls, lifecycle controls, and outbound credential guard are implemented; the deployment decisions are not approved and no remote resource or smoke evidence exists.",
    recommendation: "Keep deployment NO-GO until the owner approves the complete decision card. Then replace the URL placeholder in a temporary terminal and run preflight before creating resources.",
    value: "Prevents paid resources, DNS, and production secrets from being created before cost, identity, origin, retention, and recovery ownership are explicit.",
    risk: "Starting before the decision card is complete can expose the console, lock out the operator, create recurring cost, or leave database recovery unowned.",
    commands: [
      "$env:AI_LINK_BASE_URL=\"<confirmed-auth-hub-url>\"",
      "npm run auth-hub:remote:next",
      "npm run auth-hub:deploy:check",
      "powershell -ExecutionPolicy Bypass -File tools/check-auth-hub-deployment.ps1 -Production -BaseUrl $env:AI_LINK_BASE_URL",
      "npm run auth-hub:secrets:new",
      "npm run auth-hub:remote:smoke",
      "powershell -ExecutionPolicy Bypass -File tools/test-auth-hub-remote.ps1 -ExpectAccessGate"
    ],
    evidence: [
      "Render Web Service and Postgres are configured from render.yaml.",
      "npm run auth-hub:remote:next reports remoteReady=yes and smokeReady=yes before final smoke.",
      "The confirmed dedicated Auth Hub hostname /healthz returns the AI Link Auth Hub health payload.",
      "Unauthenticated browser access is blocked or redirected by Cloudflare Access.",
      "Application login reaches the dashboard after Cloudflare Access.",
      "npm run auth-hub:remote:smoke completes a full_chain mock task with approval and final completed status.",
      "Restricted Codex token can create/read redacted tasks but cannot lease executor work or approve publish.",
      "Task detail, connector status, and audit logs contain no Cookie, browser Profile, QR code, screenshot, token, or runtime/private content."
    ],
    secretBoundary: "Production tokens, app password, Cloudflare Service Auth credentials, DATABASE_URL, SMTP settings, browser Profile, Cookie, QR code, screenshots, and platform content stay in Render secrets, secret manager, or local runtime/private only."
  },
  {
    id: "record-v0-1-release-decisions",
    title: "Keep recorded v0.1 release decisions current",
    status: "ready",
    owner: "Release owner",
    intent: "Preserve the approved repository-local release, GitHub protection, and secret-scanning decisions while provider-live remains a separate pending gate.",
    commands: [
      "npm run release:decisions",
      "npm run release:decisions:json",
      "npm run release:decisions:next",
      "npm run release:decisions:next"
    ],
    evidence: [
      "docs/releases/v0.1.0-decisions.json has one entry for each required v0.1 decision.",
      "GitHub protection, secret scanning, and repository-local release decisions are approved with public-safe evidence.",
      "Only provider-live credentials and cost approval remain pending, and they are tracked by separate actions."
    ],
    secretBoundary: "Do not record API keys, token values, Bitwarden values, provider responses, screenshots, QR codes, login state, or runtime/private paths."
  },
  {
    id: "configure-bitwarden-secrets-manager",
    title: "Configure Bitwarden Secrets Manager",
    status: "manual",
    owner: "Secret owner",
    intent: "Create the real BWS projects, machine accounts, and secret values while keeping the public repo secret-free.",
    commands: [
      "npm run bws:next",
      "npm run bws:plan",
      "npm run bws:worksheet",
      "npm run bws:activate",
      "npm run bws:run:help",
      "npm run bws:acceptance:json",
      "npm run bws:acceptance:strict"
    ],
    evidence: [
      "AI_LINK_BWS_PROJECT_ID and AI_LINK_BWS_CI_PROJECT_ID are set to non-sensitive project ids.",
      "npm run bws:next shows the current session state and recommendedNext action.",
      "BWS_ACCESS_TOKEN exists only in the current local session.",
      "npm run bws:run can wrap real AI Link commands after strict readiness passes.",
      "npm run bws:acceptance:json reports pending, pass, and warn counts without printing secret values.",
      "npm run bws:acceptance:strict passes.",
      "No secret value appears in Git, docs, issues, PRs, logs, or chat."
    ],
    secretBoundary: "Only secret names, environment variable names, and Bitwarden project ids may appear in public artifacts."
  },
  {
    id: "configure-provider-live-environment",
    title: "Configure provider-live Environment",
    status: "manual",
    owner: "Repository maintainer and secret owner",
    intent: "Let GitHub Actions fetch real provider keys from Bitwarden without storing provider keys in GitHub secrets.",
    commands: [
      "npm run bws:github-vars:apply-plan",
      "npm run bws:github-vars:apply",
      "npm run providers:github:remote-check",
      "npm run providers:github:dispatch-plan"
    ],
    evidence: [
      "GitHub provider-live Environment has BW_ACCESS_TOKEN as the only bootstrap secret.",
      "GitHub provider-live Environment variables contain Bitwarden secret ids, not secret values.",
      "npm run providers:github:remote-check passes when GitHub credentials are available.",
      "npm run providers:github:dispatch-plan renders without dispatching live calls."
    ],
    secretBoundary: "BW_ACCESS_TOKEN is handled manually as a GitHub Environment Secret and is never printed by these helpers."
  },
  {
    id: "approve-provider-live-cost",
    title: "Approve provider-live cost boundary",
    status: "manual",
    owner: "Cost approver",
    intent: "Run a minimal live provider verification only after the provider choice and cost boundary are explicit.",
    commands: [
      "npm run providers:live:safe-report:strict",
      "npm run providers:github:dispatch-strict"
    ],
    evidence: [
      "Provider choice, outbound prompt content, and max spend are approved.",
      "Sanitized provider-live report exists in runtime/tmp/provider-live-report.json or GitHub artifact.",
      "Report does not include API key values or raw private credentials."
    ],
    secretBoundary: "Live verification is opt-in and may call external providers; keep it skipped until approval is explicit."
  },
  {
    id: "decide-v0-1-release-channel",
    title: "Keep v0.1 repository-local",
    status: "ready",
    owner: "Release owner",
    intent: "Honor the approved repository-local channel unless the release owner explicitly opens a new release-channel decision.",
    commands: [
      "npm run release:plan",
      "npm run release:manual-gates",
      "npm run release:decisions:json"
    ],
    evidence: [
      "npm-publish-decision is approved with selectedChannel=repository-local.",
      "npm publish is not selected and is not part of the current Auth Hub program.",
      "A GitHub Release or npm publish requires a new explicit release-owner decision."
    ],
    secretBoundary: "This report never creates tags, publishes npm packages, or changes release settings."
  }
];

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    ok: true,
    nextOpen: actions.filter((action) => action.status !== "ready").length,
    counts: summarize(actions)
  },
  repository: {
    branch: currentBranch(),
    head: currentHead(),
    upstream: gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || undefined,
    clean: (gitOutput(["status", "--porcelain"]) ?? "").length === 0
  },
  safety: [
    "Does not read API keys, tokens, .env files, GitHub secrets, Bitwarden values, provider responses, or runtime/private.",
    "Does not modify GitHub settings, create tags, publish npm packages, write Bitwarden secrets, or dispatch live providers.",
    "Use this as the top-level handoff map; use the listed commands for detailed evidence."
  ],
  actions
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

function summarize(items) {
  const counts = {};
  for (const item of items) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  return counts;
}

function gitOutput(commandArgs) {
  const result = spawnSync("git", commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  if (result.error || result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

function currentBranch() {
  return gitOutput(["branch", "--show-current"])
    || process.env.GITHUB_HEAD_REF
    || process.env.GITHUB_REF_NAME
    || "detached";
}

function currentHead() {
  return gitOutput(["rev-parse", "--short", "HEAD"])
    || process.env.GITHUB_SHA?.slice(0, 7)
    || "unknown";
}

function renderMarkdown(nextReport) {
  const lines = [];
  lines.push("# AI Link Next Actions");
  lines.push("");
  lines.push(`Generated: ${nextReport.generatedAt}`);
  lines.push("");
  lines.push("This report is safe for public logs. It does not read or print secret values.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- OK: ${nextReport.summary.ok ? "yes" : "no"}`);
  lines.push(`- Manual open: ${nextReport.summary.nextOpen}`);
  lines.push(`- Repository: ${nextReport.repository.branch ?? "unknown"} @ ${nextReport.repository.head ?? "unknown"}`);
  lines.push(`- Working tree clean: ${nextReport.repository.clean ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Action Map");
  lines.push("");
  lines.push("| Action | Status | Owner |");
  lines.push("| --- | --- | --- |");
  for (const action of nextReport.actions) {
    lines.push(`| ${escapeCell(action.title)} | ${escapeCell(action.status)} | ${escapeCell(action.owner)} |`);
  }
  lines.push("");

  for (const action of nextReport.actions) {
    lines.push(`## ${action.title}`);
    lines.push("");
    lines.push(`Owner: ${action.owner}`);
    lines.push("");
    lines.push(`Intent: ${action.intent}`);
    lines.push("");
    if (action.background) {
      lines.push(`Background: ${action.background}`);
      lines.push("");
    }
    if (action.recommendation) {
      lines.push(`Recommendation: ${action.recommendation}`);
      lines.push(`Value: ${action.value}`);
      lines.push(`Risk: ${action.risk}`);
      lines.push("");
    }
    pushList(lines, "Evidence", action.evidence);
    lines.push("Commands:");
    lines.push("");
    pushCommandBlock(lines, action.commands);
    lines.push("");
    lines.push(`Secret boundary: ${action.secretBoundary}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function pushList(lines, title, items) {
  lines.push(`${title}:`);
  lines.push("");
  for (const item of items) {
    lines.push(`- ${item}`);
  }
  lines.push("");
}

function pushCommandBlock(lines, commands) {
  lines.push("```powershell");
  lines.push(...commands);
  lines.push("```");
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
