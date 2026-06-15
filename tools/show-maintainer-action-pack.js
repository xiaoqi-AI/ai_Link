#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");
const cwd = process.cwd();

const reports = {
  nextActions: runJson([process.execPath, "tools/show-next-actions.js", "--json"]),
  setupHandoff: runJson([process.execPath, "tools/show-setup-handoff.js", "--json"]),
  bwsNext: runJson([process.execPath, "tools/show-bws-next.js", "--json"]),
  githubHardeningNext: runJson([process.execPath, "tools/show-github-hardening-next.js", "--json"]),
  releaseDecisionNext: runJson([process.execPath, "tools/show-release-decision-next.js", "--json"]),
  releaseReadiness: runJson([process.execPath, "tools/check-release-readiness.js", "--json"])
};

const setupPhase = (id) => reports.setupHandoff?.phases?.find((phase) => phase.id === id);
const nextAction = (id) => reports.nextActions?.actions?.find((action) => action.id === id);
const githubPhase = (id) => reports.githubHardeningNext?.phases?.find((phase) => phase.id === id);
const decisionNext = (id) => reports.releaseDecisionNext?.decisions?.find((decision) => decision.id === id);

const githubRecordPhase = githubPhase("record-public-safe-decisions");
const branchProtectionPhase = githubPhase("configure-main-protection");
const secretScanningPhase = githubPhase("configure-secret-scanning");
const bitwardenPhase = setupPhase("bitwarden-foundation");
const providerLiveWiringPhase = setupPhase("github-provider-live-wiring");
const providerLiveCostPhase = setupPhase("provider-live-cost-and-verification");
const releaseChannelPhase = setupPhase("release-channel");
const releaseDecisionPhase = setupPhase("release-decision-record");
const npmDecision = decisionNext("npm-publish-decision");
const providerDecision = decisionNext("provider-live-credentials");

const repositoryLocalSuggestion = npmDecision?.suggestions?.find((suggestion) => suggestion.id === "repository-local");
const providerLiveWaiveSuggestion = providerDecision?.suggestions?.find((suggestion) => suggestion.id === "waive-live-claim");

const sections = [
  {
    id: "baseline-before-external-work",
    title: "Baseline before external work",
    status: reports.nextActions?.repository?.clean ? "ready" : "manual",
    owner: "Maintainer or Codex",
    purpose: "Confirm the public repo is safe and current before touching GitHub UI, Bitwarden, provider-live, or release decisions.",
    commands: [
      "npm run next:actions",
      "npm run setup:handoff",
      "npm run release:readiness:json",
      "npm run security:scan"
    ],
    evidence: [
      repoEvidence(),
      summarizeReport("release:readiness", reports.releaseReadiness),
      "No runtime/private, .env, token, screenshot, or provider response is needed."
    ],
    stopBefore: [
      "Do not update release decisions from a dirty or unsynced public repository."
    ],
    secretBoundary: "This section is read-only and does not need credentials."
  },
  {
    id: "github-ui-hardening",
    title: "GitHub UI hardening",
    status: "manual",
    owner: branchProtectionPhase?.owner ?? "Repository maintainer",
    purpose: nextAction("configure-github-hardening")?.intent ?? "Turn repository safety recommendations into GitHub-side settings.",
    links: unique([
      ...(branchProtectionPhase?.links ?? []),
      ...(secretScanningPhase?.links ?? [])
    ]),
    commands: unique([
      ...(branchProtectionPhase?.commands ?? []),
      ...(secretScanningPhase?.commands ?? []),
      "npm run github:hardening:next"
    ]),
    evidence: unique([
      ...(branchProtectionPhase?.evidence ?? []),
      ...(secretScanningPhase?.evidence ?? []),
      "After UI setup, record only public-safe evidence in docs/releases/v0.1.0-decisions.json."
    ]),
    afterReviewCommands: unique([
      ...(githubRecordPhase?.commands ?? []),
      ...(githubRecordPhase?.writeCommands ?? [])
    ]),
    stopBefore: [
      "Do not test secret scanning by committing, pasting, or screenshotting sample secret-looking values."
    ],
    secretBoundary: "GitHub UI evidence should mention setting names and command output only, never tokens, screenshots, QR codes, or login state."
  },
  {
    id: "bitwarden-local-foundation",
    title: "Bitwarden local foundation",
    status: "manual",
    owner: bitwardenPhase?.owner ?? "Secret owner",
    purpose: bitwardenPhase?.goal ?? "Create the real Bitwarden projects and session-only local setup.",
    commands: bitwardenPhase?.commands ?? [
      "npm run bws:next",
      "npm run bws:plan",
      "npm run bws:activate",
      "npm run bws:run:help",
      "npm run bws:acceptance:json",
      "npm run bws:acceptance:strict"
    ],
    evidence: bitwardenPhase?.evidence ?? [],
    stopBefore: bitwardenPhase?.stopBefore ?? [
      "Do not save BWS_ACCESS_TOKEN in project files."
    ],
    secretBoundary: bitwardenPhase?.secretBoundary ?? "Only project ids and environment variable names may appear in public artifacts."
  },
  {
    id: "provider-live-github-wiring",
    title: "Provider-live GitHub wiring",
    status: "manual",
    owner: providerLiveWiringPhase?.owner ?? "Repository maintainer and secret owner",
    purpose: providerLiveWiringPhase?.goal ?? "Wire GitHub provider-live through Bitwarden without storing provider keys in GitHub variables.",
    commands: providerLiveWiringPhase?.commands ?? [
      "npm run bws:github-vars:apply-plan",
      "npm run providers:github:remote-check",
      "npm run providers:github:dispatch-plan"
    ],
    evidence: providerLiveWiringPhase?.evidence ?? [],
    stopBefore: providerLiveWiringPhase?.stopBefore ?? [
      "Do not dispatch provider-live before cost approval."
    ],
    secretBoundary: providerLiveWiringPhase?.secretBoundary ?? "BW_ACCESS_TOKEN stays in GitHub Environment secrets and is never printed."
  },
  {
    id: "release-decision-closeout",
    title: "Release decision closeout",
    status: "manual",
    owner: releaseDecisionPhase?.owner ?? "Release owner",
    purpose: releaseDecisionPhase?.goal ?? "Close the public-safe release decision record after real evidence exists.",
    commands: unique([
      ...(releaseDecisionPhase?.commands ?? []),
      repositoryLocalSuggestion?.previewCommand,
      providerLiveWaiveSuggestion?.previewCommand
    ].filter(Boolean)),
    evidence: unique([
      ...(releaseDecisionPhase?.evidence ?? []),
      "Use preview commands first; add --yes only after checking evidence is public-safe."
    ]),
    afterReviewCommands: unique([
      repositoryLocalSuggestion?.writeCommand,
      providerLiveWaiveSuggestion?.writeCommand,
      "npm run release:decisions:strict"
    ].filter(Boolean)),
    stopBefore: releaseDecisionPhase?.stopBefore ?? [
      "Do not mark pending decisions approved until external evidence exists."
    ],
    secretBoundary: releaseDecisionPhase?.secretBoundary ?? "Decision records must not include secrets, screenshots, raw provider responses, or runtime/private paths."
  },
  {
    id: "provider-live-cost-gate",
    title: "Provider-live cost gate",
    status: "gated",
    owner: providerLiveCostPhase?.owner ?? "Secret owner and cost approver",
    purpose: providerLiveCostPhase?.goal ?? "Run live provider verification only after credentials and cost boundaries are explicit.",
    commands: providerLiveCostPhase?.commands ?? [
      "npm run providers:live:safe-report:strict",
      "npm run providers:github:dispatch-strict"
    ],
    evidence: providerLiveCostPhase?.evidence ?? [],
    stopBefore: providerLiveCostPhase?.stopBefore ?? [
      "Do not run live provider verification until provider choice, prompt content, and spend boundary are approved."
    ],
    secretBoundary: providerLiveCostPhase?.secretBoundary ?? "Live verification may call paid external providers; keep raw responses private."
  },
  {
    id: "release-channel-choice",
    title: "Release channel choice",
    status: "gated",
    owner: releaseChannelPhase?.owner ?? "Release owner",
    purpose: releaseChannelPhase?.goal ?? "Choose repository-local, GitHub Release, or npm-public for v0.1.",
    commands: releaseChannelPhase?.commands ?? [
      "npm run release:plan",
      "npm run release:manual-gates",
      "npm run release:decisions:next",
      "npm publish --dry-run --access public"
    ],
    evidence: releaseChannelPhase?.evidence ?? [],
    stopBefore: releaseChannelPhase?.stopBefore ?? [
      "Do not create release artifacts before release decisions are closed or waived."
    ],
    secretBoundary: releaseChannelPhase?.secretBoundary ?? "Release-channel evidence must be public-safe."
  }
];

const counts = summarize(sections);
const sourceReports = Object.values(reports);
const missingSourceCount = sourceReports.filter((reportValue) => !reportValue).length;
const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    ok: missingSourceCount === 0,
    manualOpen: sections.filter((section) => section.status !== "ready").length,
    missingSourceCount,
    counts
  },
  repository: {
    branch: (reports.nextActions?.repository?.branch ?? gitOutput(["branch", "--show-current"])) || undefined,
    head: (reports.nextActions?.repository?.head ?? gitOutput(["rev-parse", "--short", "HEAD"])) || undefined,
    upstream: (reports.nextActions?.repository?.upstream ?? gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])) || undefined,
    clean: Boolean(reports.nextActions?.repository?.clean)
  },
  sources: {
    nextActions: summarizeSource(reports.nextActions),
    setupHandoff: summarizeSource(reports.setupHandoff),
    bwsNext: summarizeSource(reports.bwsNext),
    githubHardeningNext: summarizeSource(reports.githubHardeningNext),
    releaseDecisionNext: summarizeSource(reports.releaseDecisionNext),
    releaseReadiness: summarizeSource(reports.releaseReadiness)
  },
  safety: [
    "Does not read API keys, tokens, .env files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, screenshots, or runtime/private.",
    "Does not modify GitHub settings, release records, tags, npm packages, Bitwarden secrets, GitHub secrets, or provider-live workflows.",
    "Write commands are shown only as after-review handoff; run them only after the owner confirms public-safe evidence."
  ],
  sections
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

if (missingSourceCount > 0) {
  process.exitCode = 2;
}

function runJson(commandParts) {
  const [command, ...commandArgs] = commandParts;
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    env: process.env
  });

  if (result.error || result.status !== 0) {
    return undefined;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
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

function summarize(items) {
  const counts = {};
  for (const item of items) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  return counts;
}

function summarizeSource(sourceReport) {
  if (!sourceReport) {
    return {
      ok: false,
      available: false
    };
  }
  return {
    ok: Boolean(sourceReport.summary?.ok),
    available: true,
    manualOpen: Number(sourceReport.summary?.manualOpen ?? sourceReport.summary?.nextOpen ?? 0),
    counts: sourceReport.summary?.counts ?? {}
  };
}

function summarizeReport(name, sourceReport) {
  if (!sourceReport) {
    return `${name} report is unavailable.`;
  }
  const manualOpen = Number(sourceReport.summary?.manualOpen ?? sourceReport.summary?.nextOpen ?? 0);
  return `${name} ok=${sourceReport.summary?.ok ? "yes" : "no"}, manualOpen=${manualOpen}.`;
}

function repoEvidence() {
  const branch = reports.nextActions?.repository?.branch ?? "unknown";
  const head = reports.nextActions?.repository?.head ?? "unknown";
  const clean = reports.nextActions?.repository?.clean ? "clean" : "dirty";
  return `Repository ${branch} @ ${head} is ${clean}.`;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function renderMarkdown(actionPack) {
  const lines = [];
  lines.push("# AI Link Maintainer Action Pack");
  lines.push("");
  lines.push(`Generated: ${actionPack.generatedAt}`);
  lines.push("");
  lines.push("This report is safe for public logs. It does not read or print secret values.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- OK: ${actionPack.summary.ok ? "yes" : "no"}`);
  lines.push(`- Manual open: ${actionPack.summary.manualOpen}`);
  lines.push(`- Missing source reports: ${actionPack.summary.missingSourceCount}`);
  lines.push(`- Repository: ${actionPack.repository.branch ?? "unknown"} @ ${actionPack.repository.head ?? "unknown"}`);
  lines.push(`- Working tree clean: ${actionPack.repository.clean ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Sections");
  lines.push("");
  lines.push("| Section | Status | Owner |");
  lines.push("| --- | --- | --- |");
  for (const section of actionPack.sections) {
    lines.push(`| ${escapeCell(section.title)} | ${escapeCell(section.status)} | ${escapeCell(section.owner)} |`);
  }
  lines.push("");

  for (const section of actionPack.sections) {
    lines.push(`## ${section.title}`);
    lines.push("");
    lines.push(`Owner: ${section.owner}`);
    lines.push("");
    lines.push(`Purpose: ${section.purpose}`);
    lines.push("");
    if (section.links?.length > 0) {
      pushList(lines, "Links", section.links);
    }
    pushList(lines, "Evidence", section.evidence);
    lines.push("Commands:");
    lines.push("");
    pushCommandBlock(lines, section.commands);
    lines.push("");
    if (section.afterReviewCommands?.length > 0) {
      lines.push("After review:");
      lines.push("");
      pushCommandBlock(lines, section.afterReviewCommands);
      lines.push("");
    }
    pushList(lines, "Stop before", section.stopBefore);
    lines.push(`Secret boundary: ${section.secretBoundary}`);
    lines.push("");
  }

  lines.push("## Safety Boundary");
  lines.push("");
  for (const line of actionPack.safety) {
    lines.push(`- ${line}`);
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
