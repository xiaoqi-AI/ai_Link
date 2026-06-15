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
    id: "configure-github-hardening",
    title: "Configure GitHub hardening",
    status: "manual",
    owner: "Repository maintainer",
    intent: "Turn the public repository safety recommendations into remote GitHub settings.",
    commands: [
      "npm run github:hardening",
      "npm run github:hardening:next",
      "npm run release:manual-gates",
      "npm run github:safety:json"
    ],
    evidence: [
      "GitHub hardening worksheet is reviewed by the repository maintainer.",
      "npm run github:hardening:next shows UI links, verification commands, and public-safe decision update previews.",
      "main has branch protection or a repository ruleset.",
      "Verify is a required status check.",
      "Secret scanning and push protection are enabled.",
      "npm run github:safety:json reports remote protection as pass when gh, GH_TOKEN, or GITHUB_TOKEN can verify it."
    ],
    secretBoundary: "Do not paste sample secrets into GitHub issues, PRs, docs, screenshots, or test commits."
  },
  {
    id: "record-v0-1-release-decisions",
    title: "Record v0.1 release decisions",
    status: "manual",
    owner: "Release owner",
    intent: "Turn the manual release gates into a public-safe decision record that scripts can verify before tag, npm publish, or provider-live claims.",
    commands: [
      "npm run release:decisions",
      "npm run release:decisions:json",
      "npm run release:decisions:next",
      "npm run release:decisions:update -- --id npm-publish-decision --status approved --selected-channel repository-local --evidence \"Release owner selected repository-local after package smoke checks.\"",
      "npm run release:decisions:strict"
    ],
    evidence: [
      "docs/releases/v0.1.0-decisions.json has one entry for each required v0.1 decision.",
      "Approved decisions cite only public-safe evidence.",
      "npm run release:decisions:strict passes before creating a release tag, publishing npm, or claiming live provider verification."
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
      "npm run bws:next shows the current session state and the next safe command.",
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
    title: "Decide v0.1 release channel",
    status: "manual",
    owner: "Release owner",
    intent: "Decide whether v0.1 stays repository-local or becomes a public npm/GitHub Release.",
    commands: [
      "npm run release:plan",
      "npm run release:manual-gates",
      "npm run release:decisions:next",
      "npm publish --dry-run --access public"
    ],
    evidence: [
      "Release owner chooses repository-local usage or npm publish.",
      "If publishing, package ownership, rollback policy, and dry-run output are reviewed.",
      "Git tag and GitHub Release are created only after manual gates are accepted."
    ],
    secretBoundary: "This report never creates tags, publishes npm packages, or changes release settings."
  }
];

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    ok: true,
    nextOpen: actions.filter((action) => action.status === "manual").length,
    counts: summarize(actions)
  },
  repository: {
    branch: gitOutput(["branch", "--show-current"]) || undefined,
    head: gitOutput(["rev-parse", "--short", "HEAD"]) || undefined,
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
