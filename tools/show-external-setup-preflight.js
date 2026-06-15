#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");
const cwd = process.cwd();

const reports = {
  nextActions: runJson([process.execPath, "tools/show-next-actions.js", "--json"]),
  maintainerPack: runJson([process.execPath, "tools/show-maintainer-action-pack.js", "--json"]),
  bwsNext: runJson([process.execPath, "tools/show-bws-next.js", "--json"]),
  githubHardeningNext: runJson([process.execPath, "tools/show-github-hardening-next.js", "--json"]),
  releaseDecisionNext: runJson([process.execPath, "tools/show-release-decision-next.js", "--json"]),
  roadmapNext: runJson([process.execPath, "tools/show-roadmap-next.js", "--json"]),
  releaseReadiness: runJson([process.execPath, "tools/check-release-readiness.js", "--json"])
};

const sourceReports = Object.entries(reports);
const missingSources = sourceReports
  .filter(([, report]) => !report)
  .map(([name]) => name);
const failedSources = sourceReports
  .filter(([, report]) => report && report.summary?.ok === false)
  .map(([name]) => name);

const branch = gitOutput(["branch", "--show-current"]);
const head = gitOutput(["rev-parse", "--short", "HEAD"]);
const upstream = gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
const statusPorcelain = gitOutput(["status", "--porcelain"]);
const clean = statusPorcelain === "";
const aheadBehind = upstream ? gitOutput(["rev-list", "--left-right", "--count", `${upstream}...HEAD`]) : "";
const [behind, ahead] = parseAheadBehind(aheadBehind);
const synced = upstream ? ahead === 0 && behind === 0 : false;

const blockers = [];
if (missingSources.length > 0) blockers.push(`missing source reports: ${missingSources.join(", ")}`);
if (failedSources.length > 0) blockers.push(`failing source reports: ${failedSources.join(", ")}`);
if (!clean) blockers.push("working tree is not clean");
if (!upstream) blockers.push("upstream branch is not configured");
if (upstream && !synced) blockers.push(`branch is not synced with upstream: behind ${behind}, ahead ${ahead}`);

const githubSection = sectionById("github-ui-hardening");
const bitwardenSection = sectionById("bitwarden-local-foundation");
const providerLiveSection = sectionById("provider-live-github-wiring");
const costSection = sectionById("provider-live-cost-gate");
const releaseDecisionSection = sectionById("release-decision-closeout");
const releaseChannelSection = sectionById("release-channel-choice");

const gates = [
  {
    id: "repository-baseline",
    title: "Repository baseline",
    status: clean && synced && missingSources.length === 0 && failedSources.length === 0 ? "ready" : "hold",
    owner: "Maintainer or Codex",
    purpose: "Start external Bitwarden or GitHub UI work only from a clean, synced public repository.",
    evidence: [
      `Branch: ${branch || "unknown"}.`,
      `Head: ${head || "unknown"}.`,
      `Upstream: ${upstream || "not configured"}.`,
      `Working tree clean: ${clean ? "yes" : "no"}.`,
      upstream ? `Sync: behind ${behind}, ahead ${ahead}.` : "Sync: unavailable.",
      missingSources.length === 0 ? "All source reports are available." : `Missing source reports: ${missingSources.join(", ")}.`,
      failedSources.length === 0 ? "No source report is failing." : `Failing source reports: ${failedSources.join(", ")}.`
    ],
    commands: [
      "npm run external:preflight",
      "npm run maintainer:pack",
      "npm run release:readiness:json",
      "npm run security:scan"
    ],
    stopBefore: [
      "Do not record external setup decisions from a dirty or unsynced repository."
    ],
    secretBoundary: "No credential is needed for this gate."
  },
  {
    id: "github-ui-hardening",
    title: "GitHub UI hardening",
    status: blockers.length === 0 ? "manual" : "hold",
    owner: githubSection?.owner ?? "Repository maintainer",
    purpose: githubSection?.purpose ?? "Configure public repository safety settings in GitHub UI.",
    links: githubSection?.links ?? [],
    evidence: githubSection?.evidence ?? [],
    commands: unique([
      "npm run external:preflight",
      ...(githubSection?.commands ?? []),
      "npm run github:safety:json"
    ]),
    afterReviewCommands: githubSection?.afterReviewCommands ?? [],
    stopBefore: unique([
      "Do not paste real or fake secret-looking values into GitHub to test scanning.",
      ...(githubSection?.stopBefore ?? [])
    ]),
    secretBoundary: githubSection?.secretBoundary ?? "Record only public-safe GitHub setting names and command results."
  },
  {
    id: "bitwarden-foundation",
    title: "Bitwarden foundation",
    status: blockers.length === 0 ? "manual" : "hold",
    owner: bitwardenSection?.owner ?? "Secret owner",
    purpose: bitwardenSection?.purpose ?? "Create the real Bitwarden Secrets Manager projects and machine accounts.",
    evidence: bitwardenSection?.evidence ?? [],
    commands: unique([
      "npm run external:preflight",
      ...(bitwardenSection?.commands ?? []),
      "npm run bws:acceptance:json"
    ]),
    stopBefore: unique([
      "Do not save BWS_ACCESS_TOKEN in the project directory.",
      ...(bitwardenSection?.stopBefore ?? [])
    ]),
    secretBoundary: bitwardenSection?.secretBoundary ?? "Only names, ids, and environment variable names may be public."
  },
  {
    id: "provider-live-wiring",
    title: "Provider-live wiring",
    status: "gated",
    owner: providerLiveSection?.owner ?? "Repository maintainer and secret owner",
    purpose: providerLiveSection?.purpose ?? "Wire provider-live through Bitwarden after the bootstrap secret and secret ids exist.",
    evidence: providerLiveSection?.evidence ?? [],
    commands: unique([
      "npm run external:preflight",
      ...(providerLiveSection?.commands ?? []),
      "npm run providers:github:dispatch-plan"
    ]),
    stopBefore: unique([
      "Do not run provider-live dispatch before Bitwarden setup and cost approval.",
      ...(providerLiveSection?.stopBefore ?? [])
    ]),
    secretBoundary: providerLiveSection?.secretBoundary ?? "GitHub stores BW_ACCESS_TOKEN as a secret and secret ids as variables."
  },
  {
    id: "release-decision-record",
    title: "Release decision record",
    status: "manual",
    owner: releaseDecisionSection?.owner ?? "Release owner",
    purpose: releaseDecisionSection?.purpose ?? "Record external setup evidence in public-safe release decisions.",
    evidence: releaseDecisionSection?.evidence ?? [],
    commands: unique([
      "npm run external:preflight",
      ...(releaseDecisionSection?.commands ?? []),
      "npm run release:decisions:next"
    ]),
    afterReviewCommands: releaseDecisionSection?.afterReviewCommands ?? [],
    stopBefore: releaseDecisionSection?.stopBefore ?? [
      "Do not approve decisions until public-safe evidence exists."
    ],
    secretBoundary: releaseDecisionSection?.secretBoundary ?? "Decision records must never contain secret values."
  },
  {
    id: "provider-live-cost",
    title: "Provider-live cost boundary",
    status: "gated",
    owner: costSection?.owner ?? "Cost approver",
    purpose: costSection?.purpose ?? "Approve provider choice, prompt content, and spend boundary before live calls.",
    evidence: costSection?.evidence ?? [],
    commands: costSection?.commands ?? [
      "npm run providers:live:safe-report:strict",
      "npm run providers:github:dispatch-strict"
    ],
    stopBefore: costSection?.stopBefore ?? [
      "Do not run live provider verification before explicit cost approval."
    ],
    secretBoundary: costSection?.secretBoundary ?? "Keep raw provider responses and credentials private."
  },
  {
    id: "release-channel",
    title: "Release channel",
    status: "gated",
    owner: releaseChannelSection?.owner ?? "Release owner",
    purpose: releaseChannelSection?.purpose ?? "Choose repository-local, GitHub Release, or npm-public.",
    evidence: releaseChannelSection?.evidence ?? [],
    commands: releaseChannelSection?.commands ?? [
      "npm run release:plan",
      "npm run release:manual-gates",
      "npm run release:decisions:next"
    ],
    stopBefore: releaseChannelSection?.stopBefore ?? [
      "Do not create release artifacts before release decisions are closed or waived."
    ],
    secretBoundary: releaseChannelSection?.secretBoundary ?? "Release evidence must be public-safe."
  }
];

const counts = summarize(gates);
const canStartExternalSetup = blockers.length === 0;
const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    ok: missingSources.length === 0 && failedSources.length === 0,
    canStartExternalSetup,
    blockingCount: blockers.length,
    manualOpen: gates.filter((gate) => gate.status === "manual" || gate.status === "gated").length,
    counts
  },
  repository: {
    branch: branch || undefined,
    head: head || undefined,
    upstream: upstream || undefined,
    clean,
    behind,
    ahead,
    synced
  },
  sources: Object.fromEntries(sourceReports.map(([name, source]) => [name, summarizeSource(source)])),
  blockers,
  safety: [
    "Does not read API keys, tokens, .env files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, screenshots, or runtime/private.",
    "Does not modify Bitwarden, GitHub settings, release records, tags, npm packages, or provider-live workflows.",
    "Use this as a go/no-go preflight before manual external setup; it is not proof that external setup is complete."
  ],
  firstSafeSequence: [
    "npm run external:preflight",
    "npm run github:hardening:next",
    "npm run bws:next",
    "npm run bws:acceptance:json",
    "npm run release:decisions:next",
    "npm run providers:github:dispatch-plan"
  ],
  gates
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

if (!report.summary.ok) {
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

function parseAheadBehind(value) {
  const parts = String(value ?? "").trim().split(/\s+/).map((part) => Number.parseInt(part, 10));
  if (parts.length !== 2 || parts.some((part) => Number.isNaN(part))) {
    return [undefined, undefined];
  }
  return parts;
}

function sectionById(id) {
  return reports.maintainerPack?.sections?.find((section) => section.id === id);
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
      available: false,
      ok: false
    };
  }
  return {
    available: true,
    ok: Boolean(sourceReport.summary?.ok),
    manualOpen: Number(sourceReport.summary?.manualOpen ?? sourceReport.summary?.nextOpen ?? 0),
    counts: sourceReport.summary?.counts ?? {}
  };
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function renderMarkdown(preflight) {
  const lines = [];
  lines.push("# AI Link External Setup Preflight");
  lines.push("");
  lines.push(`Generated: ${preflight.generatedAt}`);
  lines.push("");
  lines.push("This report is safe for public logs. It does not read or print secret values.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- OK: ${preflight.summary.ok ? "yes" : "no"}`);
  lines.push(`- Ready for external manual setup: ${preflight.summary.canStartExternalSetup ? "yes" : "no"}`);
  lines.push(`- Blocking count: ${preflight.summary.blockingCount}`);
  lines.push(`- Manual or gated open: ${preflight.summary.manualOpen}`);
  lines.push(`- Repository: ${preflight.repository.branch ?? "unknown"} @ ${preflight.repository.head ?? "unknown"}`);
  lines.push(`- Working tree clean: ${preflight.repository.clean ? "yes" : "no"}`);
  lines.push(`- Sync: behind ${preflight.repository.behind ?? "unknown"}, ahead ${preflight.repository.ahead ?? "unknown"}`);
  lines.push("");
  if (preflight.blockers.length > 0) {
    lines.push("## Hold Reasons");
    lines.push("");
    for (const blocker of preflight.blockers) {
      lines.push(`- ${blocker}`);
    }
    lines.push("");
  }
  lines.push("## First Safe Sequence");
  lines.push("");
  lines.push("```powershell");
  lines.push(...preflight.firstSafeSequence);
  lines.push("```");
  lines.push("");
  lines.push("## Gates");
  lines.push("");
  lines.push("| Gate | Status | Owner |");
  lines.push("| --- | --- | --- |");
  for (const gate of preflight.gates) {
    lines.push(`| ${escapeCell(gate.title)} | ${escapeCell(gate.status)} | ${escapeCell(gate.owner)} |`);
  }
  lines.push("");

  for (const gate of preflight.gates) {
    lines.push(`## ${gate.title}`);
    lines.push("");
    lines.push(`Owner: ${gate.owner}`);
    lines.push("");
    lines.push(`Purpose: ${gate.purpose}`);
    lines.push("");
    if (gate.links?.length > 0) {
      pushList(lines, "Links", gate.links);
    }
    pushList(lines, "Evidence", gate.evidence);
    lines.push("Commands:");
    lines.push("");
    pushCommandBlock(lines, gate.commands);
    lines.push("");
    if (gate.afterReviewCommands?.length > 0) {
      lines.push("After review:");
      lines.push("");
      pushCommandBlock(lines, gate.afterReviewCommands);
      lines.push("");
    }
    pushList(lines, "Stop before", gate.stopBefore);
    lines.push(`Secret boundary: ${gate.secretBoundary}`);
    lines.push("");
  }

  lines.push("## Safety Boundary");
  lines.push("");
  for (const line of preflight.safety) {
    lines.push(`- ${line}`);
  }
  return `${lines.join("\n")}\n`;
}

function pushList(lines, title, items) {
  lines.push(`${title}:`);
  lines.push("");
  for (const item of items ?? []) {
    lines.push(`- ${item}`);
  }
  lines.push("");
}

function pushCommandBlock(lines, commands) {
  lines.push("```powershell");
  lines.push(...(commands ?? []));
  lines.push("```");
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
