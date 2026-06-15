#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");
const cwd = process.cwd();
const sourcePath = ".ai-link/bitwarden-secrets.manifest.json";

const manifest = readJson(sourcePath);
const checks = [];
const phases = [];

function addCheck(name, status, detail) {
  checks.push({ name, status, detail });
}

function addPhase(phase) {
  phases.push(phase);
}

if (!manifest) {
  addCheck("BWS manifest", "fail", `${sourcePath} missing or invalid`);
} else {
  addCheck("BWS manifest", "ready", sourcePath);
}

const bwsVersion = resolveBwsVersion();
addCheck(
  "bws CLI",
  bwsVersion ? "ready" : "manual",
  bwsVersion ? bwsVersion : "Install Bitwarden Secrets Manager CLI."
);

const localProjectPresent = Boolean(process.env.AI_LINK_BWS_PROJECT_ID);
const ciProjectPresent = Boolean(process.env.AI_LINK_BWS_CI_PROJECT_ID);
const bwsTokenPresent = Boolean(process.env.BWS_ACCESS_TOKEN);
const githubTokenPresent = Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);

addCheck("AI_LINK_BWS_PROJECT_ID", localProjectPresent ? "ready" : "manual", localProjectPresent ? "present; value not printed" : "Set after creating ai-link-local-dev.");
addCheck("AI_LINK_BWS_CI_PROJECT_ID", ciProjectPresent ? "ready" : "manual", ciProjectPresent ? "present; value not printed" : "Set after creating ai-link-ci.");
addCheck("BWS_ACCESS_TOKEN", bwsTokenPresent ? "ready" : "manual", bwsTokenPresent ? "present; value not printed" : "Set only in the current local session.");
addCheck("GH_TOKEN or GITHUB_TOKEN", githubTokenPresent ? "ready" : "manual", githubTokenPresent ? "present; value not printed" : "Optional; needed for remote GitHub Environment checks.");

const projectCount = manifest ? Object.keys(manifest.projects ?? {}).length : 0;
const providerLiveEnv = manifest?.githubEnvironments?.providerLive;
const providerSecretIdCount = providerLiveEnv?.secretIdVariables ? Object.keys(providerLiveEnv.secretIdVariables).length : 0;

addPhase({
  id: "review-target-structure",
  title: "Review target BWS structure",
  status: manifest ? "ready" : "manual",
  owner: "Secret owner",
  why: "Confirm the public repository expects only project names, machine-account names, secret key names, and GitHub variable names.",
  commands: [
    "npm run bws:plan",
    "npm run bws:worksheet:print"
  ],
  evidence: [
    manifest ? `${projectCount} Bitwarden project definitions are present in ${sourcePath}.` : `${sourcePath} must exist first.`,
    manifest ? `${providerSecretIdCount} provider-live secret-id variables are mapped.` : "Provider-live variable mapping is unavailable."
  ],
  secretBoundary: "Manifest content is public-safe and must never include secret values."
});

addPhase({
  id: "create-bitwarden-resources",
  title: "Create Bitwarden resources",
  status: "manual",
  owner: "Secret owner",
  why: "The organization, projects, machine accounts, and secret values live outside Git and cannot be created by public repository checks.",
  commands: [
    "npm run bws:plan",
    "npm run bws:worksheet"
  ],
  evidence: [
    "Bitwarden organization ai-link-lab exists.",
    "Projects ai-link-local-dev and ai-link-ci exist.",
    "Read-only machine accounts are created for local Codex and GitHub Actions.",
    "Secret keys match environment variable names exactly."
  ],
  secretBoundary: "Only names and project ids may appear in public artifacts; secret values stay in Bitwarden."
});

addPhase({
  id: "load-local-session",
  title: "Load local BWS session",
  status: localProjectPresent && bwsTokenPresent ? "ready" : "manual",
  owner: "Local Codex operator",
  why: "Codex and AI Link need a session-only bootstrap token before bws run can inject provider keys.",
  commands: [
    "npm run bws:profile:print",
    "npm run bws:session:help",
    "npm run bws:run:help",
    "npm run bws:session"
  ],
  evidence: [
    localProjectPresent ? "AI_LINK_BWS_PROJECT_ID is present; value not printed." : "AI_LINK_BWS_PROJECT_ID is not set.",
    bwsTokenPresent ? "BWS_ACCESS_TOKEN is present; value not printed." : "BWS_ACCESS_TOKEN is not set."
  ],
  secretBoundary: "BWS_ACCESS_TOKEN must live only in the current shell session or hidden prompt flow."
});

addPhase({
  id: "verify-local-bws",
  title: "Verify local BWS readiness",
  status: localProjectPresent && bwsTokenPresent && bwsVersion ? "gated" : "manual",
  owner: "Local Codex operator",
  why: "Strict verification should run only after the real local project id and read-only machine account token are available.",
  commands: [
    "npm run bws:check:strict",
    "npm run bws:acceptance:json",
    "npm run bws:acceptance:strict",
    "npm run bws:doctor",
    "npm run bws:run -- -CommandLine \"npm run ai-link -- doctor\""
  ],
  evidence: [
    "Strict checks pass after real setup.",
    "Configured providers move from needs-key to ready where corresponding secrets exist.",
    "No secret value appears in output."
  ],
  secretBoundary: "Use doctor and provider checks through bws run; do not export provider API keys into project files."
});

addPhase({
  id: "wire-github-provider-live",
  title: "Wire GitHub provider-live Environment",
  status: ciProjectPresent && bwsTokenPresent ? "gated" : "manual",
  owner: "Repository maintainer and secret owner",
  why: "GitHub should store only BW_ACCESS_TOKEN and Bitwarden secret ids, not provider API key values.",
  commands: [
    "npm run bws:github-vars:apply-plan",
    "npm run bws:github-vars:apply",
    "npm run bws:acceptance:json",
    "npm run providers:github:remote-check"
  ],
  evidence: [
    ciProjectPresent ? "AI_LINK_BWS_CI_PROJECT_ID is present; value not printed." : "AI_LINK_BWS_CI_PROJECT_ID is not set.",
    githubTokenPresent ? "GitHub API token is present for remote checks; value not printed." : "GH_TOKEN or GITHUB_TOKEN is not set.",
    "GitHub provider-live Environment has BW_ACCESS_TOKEN as the bootstrap secret.",
    "GitHub provider-live Environment variables contain Bitwarden secret ids only."
  ],
  secretBoundary: "Repository helpers do not read or write BW_ACCESS_TOKEN; set it manually in GitHub Environment Secrets."
});

addPhase({
  id: "approve-live-provider-cost",
  title: "Approve live provider cost boundary",
  status: "gated",
  owner: "Cost approver",
  why: "Live provider verification can send prompts to external providers and may create model costs.",
  commands: [
    "npm run providers:live:safe-report:strict",
    "npm run providers:github:dispatch-plan",
    "npm run providers:github:dispatch-strict"
  ],
  evidence: [
    "Provider set, outbound prompt content, and maximum spend are explicitly approved.",
    "Sanitized provider-live report or GitHub artifact exists after the approved run."
  ],
  secretBoundary: "Never include raw provider responses, API keys, Bitwarden values, screenshots, or login state in Git, docs, issues, PRs, or chat."
});

const checkCounts = { ready: 0, manual: 0, gated: 0, fail: 0 };
for (const check of checks) {
  checkCounts[check.status] += 1;
}
const phaseCounts = { ready: 0, manual: 0, gated: 0, fail: 0 };
for (const phase of phases) {
  phaseCounts[phase.status] += 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  source: sourcePath,
  summary: {
    ok: checkCounts.fail === 0 && phaseCounts.fail === 0,
    manualOpen: phaseCounts.manual + phaseCounts.gated,
    counts: phaseCounts,
    checkCounts
  },
  snapshot: manifest ? buildSnapshot(manifest) : undefined,
  safety: [
    "Does not read API keys, tokens, .env files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, or runtime/private.",
    "Reports bootstrap credentials only as present or missing; values are never printed.",
    "Does not modify Bitwarden, GitHub settings, release records, tags, npm packages, or provider-live workflows."
  ],
  checks,
  phases
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

if (!report.summary.ok) {
  process.exitCode = 2;
}

function buildSnapshot(record) {
  return {
    mode: String(record.mode ?? ""),
    organization: String(record.organization ?? ""),
    projects: Object.entries(record.projects ?? {}).map(([key, project]) => ({
      key,
      name: String(project?.name ?? ""),
      machineAccount: String(project?.machineAccount ?? ""),
      expectedSecretCount: Array.isArray(project?.expectedSecretKeys) ? project.expectedSecretKeys.length : 0
    })),
    githubEnvironments: Object.entries(record.githubEnvironments ?? {}).map(([key, environment]) => ({
      key,
      name: String(environment?.name ?? ""),
      bootstrapSecret: String(environment?.bootstrapSecret ?? ""),
      secretIdVariableCount: environment?.secretIdVariables ? Object.keys(environment.secretIdVariables).length : 0
    }))
  };
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(path.resolve(cwd, relativePath), "utf8"));
  } catch {
    return undefined;
  }
}

function resolveBwsVersion() {
  return configuredBwsVersion()
    || commandVersion("bws", ["--version"])
    || windowsDefaultBwsVersion();
}

function configuredBwsVersion() {
  const configuredPath = process.env.AI_LINK_BWS_CLI_PATH;
  if (!configuredPath) {
    return "";
  }

  const resolvedPath = path.resolve(cwd, configuredPath);
  if (!existsSync(resolvedPath)) {
    return "";
  }
  return commandVersion(resolvedPath, ["--version"]);
}

function windowsDefaultBwsVersion() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return "";
  }

  const defaultPath = path.join(localAppData, "Programs", "BitwardenSecretsManager", "bin", "bws.exe");
  if (!existsSync(defaultPath)) {
    return "";
  }
  return commandVersion(defaultPath, ["--version"]);
}

function commandVersion(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8"
  });
  if (result.error || result.status !== 0) {
    return "";
  }
  return firstLine(result.stdout || result.stderr);
}

function firstLine(value) {
  return String(value ?? "").trim().split(/\r?\n/)[0] || "available";
}

function renderMarkdown(nextReport) {
  const lines = [];
  lines.push("# AI Link BWS Next Steps");
  lines.push("");
  lines.push(`Generated: ${nextReport.generatedAt}`);
  lines.push(`Source: ${nextReport.source}`);
  lines.push("");
  lines.push("This report is safe for public logs. It does not read or print secret values.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- OK: ${nextReport.summary.ok ? "yes" : "no"}`);
  lines.push(`- Manual or gated open: ${nextReport.summary.manualOpen}`);
  lines.push(`- Phase counts: ready ${nextReport.summary.counts.ready}, manual ${nextReport.summary.counts.manual}, gated ${nextReport.summary.counts.gated}, fail ${nextReport.summary.counts.fail}`);
  lines.push(`- Session checks: ready ${nextReport.summary.checkCounts.ready}, manual ${nextReport.summary.checkCounts.manual}, gated ${nextReport.summary.checkCounts.gated}, fail ${nextReport.summary.checkCounts.fail}`);
  if (nextReport.snapshot) {
    lines.push(`- Organization: ${nextReport.snapshot.organization}`);
    lines.push(`- Projects: ${nextReport.snapshot.projects.map((project) => project.name).join(", ")}`);
  }
  lines.push("");
  lines.push("## Current Session");
  lines.push("");
  lines.push("| Check | Status | Detail |");
  lines.push("| --- | --- | --- |");
  for (const check of nextReport.checks) {
    lines.push(`| ${escapeCell(check.name)} | ${escapeCell(check.status)} | ${escapeCell(check.detail)} |`);
  }
  lines.push("");
  lines.push("## Phases");
  lines.push("");
  lines.push("| Phase | Status | Owner |");
  lines.push("| --- | --- | --- |");
  for (const phase of nextReport.phases) {
    lines.push(`| ${escapeCell(phase.title)} | ${escapeCell(phase.status)} | ${escapeCell(phase.owner)} |`);
  }
  lines.push("");

  for (const phase of nextReport.phases) {
    lines.push(`## ${phase.title}`);
    lines.push("");
    lines.push(`Owner: ${phase.owner}`);
    lines.push("");
    lines.push(`Why: ${phase.why}`);
    lines.push("");
    pushList(lines, "Evidence", phase.evidence);
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
