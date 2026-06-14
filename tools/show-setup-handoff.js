#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");
const cwd = process.cwd();
const decisionSource = "docs/releases/v0.1.0-decisions.json";

const phases = [
  {
    id: "local-baseline",
    order: 1,
    title: "Keep the local baseline green",
    status: "ready",
    owner: "Codex or maintainer",
    goal: "Confirm the public repository is still safe before any external Bitwarden, GitHub, provider, or release work.",
    actions: [
      "Run the local checks that do not need secrets.",
      "Keep runtime output under runtime/tmp and runtime/private out of Git.",
      "Commit and push scoped changes before asking another machine or GitHub Actions to trust the state."
    ],
    commands: [
      "npm run check",
      "npm test",
      "npm run package:check",
      "npm run package:install-smoke",
      "npm run security:scan",
      "npm run verify:fresh"
    ],
    evidence: [
      "Local checks pass.",
      "Git working tree is clean.",
      "origin/main has the same commit after push."
    ],
    stopBefore: [
      "Do not create tags, publish npm, or run live providers from an unverified local baseline."
    ],
    secretBoundary: "No provider key, Bitwarden token, GitHub secret, .env file, login state, or runtime/private file is needed."
  },
  {
    id: "bitwarden-foundation",
    order: 2,
    title: "Create Bitwarden Secrets Manager foundation",
    status: "manual",
    owner: "Secret owner",
    goal: "Create the real Bitwarden organization, projects, machine accounts, and secret values outside the public repository.",
    actions: [
      "Create organization ai-link-lab in Bitwarden Secrets Manager.",
      "Create projects ai-link-local-dev and ai-link-ci.",
      "Create read-only machine accounts ma-ai-link-local-codex and ma-ai-link-github-actions.",
      "Store provider keys and automation credentials as secret values whose keys exactly match the environment variable names."
    ],
    commands: [
      "npm run bws:plan",
      "npm run bws:worksheet",
      "npm run bws:activate",
      "npm run bws:acceptance:strict"
    ],
    evidence: [
      "AI_LINK_BWS_PROJECT_ID and AI_LINK_BWS_CI_PROJECT_ID are set to non-sensitive project ids.",
      "BWS_ACCESS_TOKEN exists only in the current local session.",
      "npm run bws:acceptance:strict passes after real setup."
    ],
    stopBefore: [
      "Do not paste secret values into docs, issues, pull requests, chat, logs, screenshots, or the knowledge mirror.",
      "Do not save BWS_ACCESS_TOKEN in the project directory."
    ],
    secretBoundary: "Only environment variable names, Bitwarden project ids, and public-safe command names may appear in public artifacts."
  },
  {
    id: "github-provider-live-wiring",
    order: 3,
    title: "Wire GitHub provider-live through Bitwarden",
    status: "manual",
    owner: "Repository maintainer and secret owner",
    goal: "Let GitHub Actions fetch provider keys from Bitwarden while GitHub stores only the bootstrap token and secret ids.",
    actions: [
      "Create or confirm the GitHub provider-live Environment.",
      "Set BW_ACCESS_TOKEN as the only bootstrap Environment Secret.",
      "Set provider-live Environment variables to Bitwarden secret ids, not secret values.",
      "Verify the workflow wiring before any live dispatch."
    ],
    commands: [
      "npm run bws:github-vars:apply-plan",
      "npm run bws:github-vars:apply",
      "npm run providers:github:remote-check",
      "npm run providers:github:dispatch-plan"
    ],
    evidence: [
      "provider-live Environment has BW_ACCESS_TOKEN as a secret.",
      "provider-live Environment variables are Bitwarden secret ids.",
      "npm run providers:github:remote-check passes when GH_TOKEN or GITHUB_TOKEN is available.",
      "npm run providers:github:dispatch-plan renders without dispatching a workflow."
    ],
    stopBefore: [
      "Do not put provider API keys directly into GitHub Environment variables.",
      "Do not run providers:github:dispatch before the cost boundary is approved."
    ],
    secretBoundary: "BW_ACCESS_TOKEN is handled manually by GitHub secrets UI and must never be printed by repository helpers."
  },
  {
    id: "github-hardening",
    order: 4,
    title: "Configure GitHub repository hardening",
    status: "manual",
    owner: "Repository maintainer",
    goal: "Protect the public repository before accepting release tags, public package claims, or live-provider claims.",
    actions: [
      "Enable main branch protection or an equivalent repository ruleset.",
      "Require the Verify status check.",
      "Disable unsafe force-push and delete paths for main.",
      "Enable secret scanning and push protection for the public repository and review the same setting for the internal companion repository."
    ],
    commands: [
      "npm run github:hardening",
      "npm run github:safety:json",
      "npm run release:manual-gates"
    ],
    evidence: [
      "GitHub UI shows the protection settings.",
      "npm run github:safety:json reports remote protection as pass when gh, GH_TOKEN, or GITHUB_TOKEN can verify it.",
      "docs/releases/v0.1.0-decisions.json records branch protection and secret scanning decisions."
    ],
    stopBefore: [
      "Do not test secret scanning by committing or pasting sample secret-looking values."
    ],
    secretBoundary: "This phase does not require API keys, provider responses, Bitwarden values, screenshots, QR codes, or login state in the repository."
  },
  {
    id: "release-decision-record",
    order: 5,
    title: "Close the public-safe release decision record",
    status: "manual",
    owner: "Release owner",
    goal: "Turn external manual setup into public-safe approved, waived, or blocked decisions that scripts can verify.",
    actions: [
      "Update docs/releases/v0.1.0-decisions.json after each manual gate is actually completed or waived.",
      "Cite only public-safe evidence, such as command names, sanitized report names, or GitHub UI setting names.",
      "Run strict decision verification before creating tags, publishing npm, or claiming live provider verification."
    ],
    commands: [
      "npm run release:decisions",
      "npm run release:decisions:json",
      "npm run release:decisions:next",
      "npm run release:decisions:update -- --id npm-publish-decision --status approved --selected-channel repository-local --evidence \"Release owner selected repository-local after package smoke checks.\"",
      "npm run release:decisions:strict"
    ],
    evidence: [
      "Each required decision has a closed status or an explicit safe blocker.",
      "Approved decisions include public-safe evidence references.",
      "npm run release:decisions:strict passes before release claims."
    ],
    stopBefore: [
      "Do not mark pending decisions as approved until the external evidence exists."
    ],
    secretBoundary: "The decision record must not contain API keys, token values, Bitwarden secret values, provider responses, screenshots, QR codes, or runtime/private paths."
  },
  {
    id: "provider-live-cost-and-verification",
    order: 6,
    title: "Approve and run minimal provider-live verification",
    status: "gated",
    owner: "Secret owner and cost approver",
    goal: "Run the smallest useful live provider check only after credentials, GitHub wiring, secret scanning, and cost boundaries are explicit.",
    actions: [
      "Choose the provider set and outbound prompt content.",
      "Approve the maximum spend for the live verification.",
      "Run a local safe report or dispatch the GitHub provider-live workflow only after approval.",
      "Keep only sanitized summaries as evidence."
    ],
    commands: [
      "npm run providers:live:safe-report:strict",
      "npm run providers:github:dispatch-strict"
    ],
    evidence: [
      "runtime/tmp/provider-live-report.json exists locally or provider-live-summary exists as a GitHub Actions artifact.",
      "The evidence contains provider names, modes, statuses, and summaries only.",
      "No raw key, raw credential, or full private provider response is included."
    ],
    stopBefore: [
      "Do not run live provider verification until the cost approver explicitly accepts the provider, prompt content, and spend boundary."
    ],
    secretBoundary: "Live verification may call paid external providers; keep raw responses and credentials out of Git, docs, issues, PRs, chat, and the knowledge mirror."
  },
  {
    id: "release-channel",
    order: 7,
    title: "Choose the v0.1 release channel",
    status: "gated",
    owner: "Release owner",
    goal: "Decide whether v0.1 remains repository-local, becomes a GitHub Release, or publishes to npm.",
    actions: [
      "Choose repository-local, github-release, or npm-public in the decision record.",
      "If npm-public is selected, review ownership, package contents, rollback path, and npm dry-run output.",
      "Create tags and public release artifacts only after manual gates are closed or waived."
    ],
    commands: [
      "npm run release:plan",
      "npm run release:manual-gates",
      "npm run release:decisions:next",
      "npm run release:decisions:update -- --id npm-publish-decision --status approved --selected-channel repository-local --evidence \"Release owner selected repository-local after package smoke checks.\"",
      "npm publish --dry-run --access public"
    ],
    evidence: [
      "docs/releases/v0.1.0-decisions.json selectedChannel is no longer undecided.",
      "npm dry-run is reviewed if npm-public is selected.",
      "No tag, GitHub Release, or npm publish happened before release owner approval."
    ],
    stopBefore: [
      "Do not create a v0.1.0 tag, GitHub Release, or npm package until release:decisions:strict passes or the release owner explicitly chooses a safer repository-local path."
    ],
    secretBoundary: "Release-channel decisions should cite public-safe evidence only and never include credentials or private provider content."
  }
];

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    ok: true,
    manualOpen: phases.filter((phase) => phase.status !== "ready").length,
    counts: summarize(phases)
  },
  repository: {
    branch: gitOutput(["branch", "--show-current"]) || undefined,
    head: gitOutput(["rev-parse", "--short", "HEAD"]) || undefined,
    upstream: gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || undefined,
    clean: (gitOutput(["status", "--porcelain"]) ?? "").length === 0
  },
  decisionSnapshot: readDecisionSnapshot(),
  safety: [
    "Does not read API keys, tokens, .env files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, or runtime/private.",
    "Does not modify GitHub settings, create tags, publish npm packages, write Bitwarden secrets, or dispatch live providers.",
    "Use this as the ordered setup handoff; use the listed commands for detailed evidence."
  ],
  phases
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
    cwd,
    encoding: "utf8"
  });
  if (result.error || result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

function readDecisionSnapshot() {
  const sourcePath = path.resolve(cwd, decisionSource);
  if (!existsSync(sourcePath)) {
    return {
      source: decisionSource,
      available: false,
      decisions: []
    };
  }

  try {
    const raw = JSON.parse(readFileSync(sourcePath, "utf8"));
    const decisions = Array.isArray(raw.decisions) ? raw.decisions : [];
    return {
      source: decisionSource,
      available: true,
      release: raw.release,
      decisions: decisions.map((decision) => ({
        id: String(decision.id ?? ""),
        title: String(decision.title ?? ""),
        status: String(decision.status ?? ""),
        selectedChannel: decision.selectedChannel === undefined ? undefined : String(decision.selectedChannel),
        evidenceCount: Array.isArray(decision.evidence) ? decision.evidence.length : 0
      }))
    };
  } catch (error) {
    return {
      source: decisionSource,
      available: false,
      error: error instanceof Error ? error.message : String(error),
      decisions: []
    };
  }
}

function renderMarkdown(handoffReport) {
  const lines = [];
  lines.push("# AI Link Setup Handoff");
  lines.push("");
  lines.push(`Generated: ${handoffReport.generatedAt}`);
  lines.push("");
  lines.push("This report is safe for public logs. It does not read or print secret values.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- OK: ${handoffReport.summary.ok ? "yes" : "no"}`);
  lines.push(`- Manual or gated phases: ${handoffReport.summary.manualOpen}`);
  lines.push(`- Repository: ${handoffReport.repository.branch ?? "unknown"} @ ${handoffReport.repository.head ?? "unknown"}`);
  lines.push(`- Working tree clean: ${handoffReport.repository.clean ? "yes" : "no"}`);
  lines.push("");

  if (handoffReport.decisionSnapshot.available) {
    lines.push("## Decision Snapshot");
    lines.push("");
    lines.push(`Source: ${handoffReport.decisionSnapshot.source}`);
    lines.push("");
    lines.push("| Decision | Status | Evidence |");
    lines.push("| --- | --- | --- |");
    for (const decision of handoffReport.decisionSnapshot.decisions) {
      lines.push(`| ${escapeCell(decision.title || decision.id)} | ${escapeCell(decision.status)} | ${decision.evidenceCount} |`);
    }
    lines.push("");
  }

  lines.push("## Ordered Phases");
  lines.push("");
  lines.push("| # | Phase | Status | Owner |");
  lines.push("| --- | --- | --- | --- |");
  for (const phase of handoffReport.phases) {
    lines.push(`| ${phase.order} | ${escapeCell(phase.title)} | ${escapeCell(phase.status)} | ${escapeCell(phase.owner)} |`);
  }
  lines.push("");

  for (const phase of handoffReport.phases) {
    lines.push(`## ${phase.order}. ${phase.title}`);
    lines.push("");
    lines.push(`Owner: ${phase.owner}`);
    lines.push("");
    lines.push(`Goal: ${phase.goal}`);
    lines.push("");
    pushList(lines, "Actions", phase.actions);
    pushList(lines, "Evidence", phase.evidence);
    pushList(lines, "Stop before", phase.stopBefore);
    lines.push("Commands:");
    lines.push("");
    pushCommandBlock(lines, phase.commands);
    lines.push("");
    lines.push(`Secret boundary: ${phase.secretBoundary}`);
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
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
