#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");
const cwd = process.cwd();
const owner = "xiaoqi-AI";
const repo = "ai_Link";
const fullName = `${owner}/${repo}`;
const branch = "main";
const requiredStatusCheck = "Verify";
const decisionSource = "docs/releases/v0.1.0-decisions.json";

const safetyReport = runJson([process.execPath, "tools/check-github-repo-safety.js", "--json"], {
  env: {
    ...process.env,
    AI_LINK_GITHUB_SAFETY_DISABLE_REMOTE: "1"
  }
});
const worksheetReport = runJson([process.execPath, "tools/new-github-hardening-worksheet.js", "--json"]);
const decisions = readDecisionRecord();

const branchDecision = findDecision("github-branch-protection");
const secretDecision = findDecision("github-secret-scanning");
const localSafetyOk = Boolean(safetyReport?.summary?.ok);
const worksheetOk = Boolean(worksheetReport?.summary?.ok);
const gitClean = gitOutput(["status", "--porcelain"]).length === 0;

const phases = [
  {
    id: "review-local-github-baseline",
    title: "Review local GitHub baseline",
    status: localSafetyOk && worksheetOk ? "ready" : "fail",
    owner: "Maintainer or Codex",
    why: "Confirm the public repository has the local files, scripts, and docs needed before changing GitHub UI settings.",
    commands: [
      "npm run github:safety:json",
      "npm run github:hardening:json",
      "npm run release:readiness:json"
    ],
    evidence: [
      localSafetyOk ? "github:safety local baseline has no fail items." : "github:safety local baseline needs repair.",
      worksheetOk ? "github:hardening worksheet renders successfully." : "github:hardening worksheet needs repair.",
      gitClean ? "Git working tree is clean." : "Git working tree has uncommitted changes."
    ],
    secretBoundary: "This phase does not need GitHub tokens, provider keys, Bitwarden values, screenshots, or login state."
  },
  {
    id: "configure-main-protection",
    title: "Configure main branch protection",
    status: branchDecision?.status === "approved" ? "ready" : "manual",
    owner: "Repository maintainer",
    why: "main should require the Verify check before v0.1 release tags, npm claims, or live-provider claims.",
    links: [
      `https://github.com/${fullName}/settings/rules`,
      `https://github.com/${fullName}/settings/branches`
    ],
    commands: [
      "npm run github:hardening",
      "npm run github:safety:json",
      "npm run release:decisions:next"
    ],
    evidence: [
      `GitHub UI shows a ruleset or branch protection rule targeting ${branch}.`,
      `The ${requiredStatusCheck} status check is required.`,
      "Force pushes and branch deletions are disabled.",
      "github:safety reports branch protection and required Verify as pass when remote metadata is available."
    ],
    secretBoundary: "Do not test branch rules by force-pushing, deleting main, or committing sample secret-like values."
  },
  {
    id: "configure-secret-scanning",
    title: "Configure secret scanning and push protection",
    status: secretDecision?.status === "approved" ? "ready" : "manual",
    owner: "Repository maintainer",
    why: "The public repo and internal companion repo need GitHub-side scanning before public release claims.",
    links: [
      `https://github.com/${fullName}/settings/security_analysis`,
      `https://github.com/${owner}/ai_Link-internal/settings/security_analysis`
    ],
    commands: [
      "npm run github:hardening",
      "npm run github:safety:json",
      "npm run security:scan",
      "npm run release:decisions:next"
    ],
    evidence: [
      "GitHub UI shows secret scanning enabled for the public repository.",
      "GitHub UI shows push protection enabled for the public repository.",
      "The internal companion repository has been reviewed for the same settings.",
      "security:scan passes locally."
    ],
    secretBoundary: "Never paste real or fake secret-looking values into GitHub issues, PRs, docs, screenshots, commits, or chat."
  },
  {
    id: "record-public-safe-decisions",
    title: "Record public-safe release decisions",
    status: branchDecision?.status === "approved" && secretDecision?.status === "approved" ? "ready" : "manual",
    owner: "Release owner",
    why: "After the GitHub UI evidence exists, the public release decision record should be updated with safe evidence only.",
    commands: [
      "npm run release:decisions:next",
      "npm run release:decisions:update -- --id github-branch-protection --status approved --evidence \"Repository maintainer confirmed main branch protection or ruleset requires Verify.\"",
      "npm run release:decisions:update -- --id github-secret-scanning --status approved --evidence \"Repository maintainer confirmed secret scanning and push protection are enabled for the public repo and reviewed for the internal companion repo.\"",
      "npm run release:decisions:strict"
    ],
    writeCommands: [
      "npm run release:decisions:update -- --id github-branch-protection --status approved --evidence \"Repository maintainer confirmed main branch protection or ruleset requires Verify.\" --yes",
      "npm run release:decisions:update -- --id github-secret-scanning --status approved --evidence \"Repository maintainer confirmed secret scanning and push protection are enabled for the public repo and reviewed for the internal companion repo.\" --yes"
    ],
    evidence: [
      "Approved decisions cite only command names, GitHub setting names, or sanitized reports.",
      "No API key, token, Bitwarden value, provider response, screenshot, QR code, login state, or runtime/private path is recorded."
    ],
    secretBoundary: "Preview decision updates first; add --yes only after checking evidence is public-safe."
  }
];

const counts = { ready: 0, manual: 0, fail: 0 };
for (const phase of phases) {
  counts[phase.status] += 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    ok: counts.fail === 0,
    manualOpen: counts.manual,
    counts
  },
  repository: {
    fullName,
    branch,
    requiredStatusCheck,
    head: gitOutput(["rev-parse", "--short", "HEAD"]) || undefined,
    upstream: gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || undefined,
    clean: gitClean
  },
  safety: [
    "Does not read API keys, tokens, .env files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, or runtime/private.",
    "Does not call GitHub APIs by default; use github:safety in an authenticated maintainer environment for remote verification.",
    "Does not modify GitHub settings, release records, tags, npm packages, Bitwarden secrets, or provider-live workflows."
  ],
  snapshot: {
    localSafety: safetyReport ? {
      ok: Boolean(safetyReport.summary?.ok),
      strictOk: Boolean(safetyReport.summary?.strictOk),
      manualOpen: Number(safetyReport.summary?.manualOpen ?? 0),
      counts: safetyReport.summary?.counts ?? {}
    } : undefined,
    worksheet: worksheetReport ? {
      ok: Boolean(worksheetReport.summary?.ok),
      manualOpen: Number(worksheetReport.summary?.manualOpen ?? 0),
      counts: worksheetReport.summary?.counts ?? {}
    } : undefined,
    decisions: [
      summarizeDecision(branchDecision),
      summarizeDecision(secretDecision)
    ].filter(Boolean)
  },
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

function runJson(commandParts, options = {}) {
  const [command, ...commandArgs] = commandParts;
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env
    }
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

function readDecisionRecord() {
  const sourcePath = path.resolve(cwd, decisionSource);
  if (!existsSync(sourcePath)) {
    return [];
  }
  try {
    const raw = JSON.parse(readFileSync(sourcePath, "utf8"));
    return Array.isArray(raw.decisions) ? raw.decisions : [];
  } catch {
    return [];
  }
}

function findDecision(id) {
  return decisions.find((decision) => decision?.id === id);
}

function summarizeDecision(decision) {
  if (!decision) return undefined;
  return {
    id: String(decision.id ?? ""),
    title: String(decision.title ?? ""),
    status: String(decision.status ?? ""),
    evidenceCount: Array.isArray(decision.evidence) ? decision.evidence.length : 0
  };
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

function renderMarkdown(nextReport) {
  const lines = [];
  lines.push("# AI Link GitHub Hardening Next Steps");
  lines.push("");
  lines.push(`Generated: ${nextReport.generatedAt}`);
  lines.push("");
  lines.push("This report is safe for public logs. It does not read or print secret values.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- OK: ${nextReport.summary.ok ? "yes" : "no"}`);
  lines.push(`- Manual open: ${nextReport.summary.manualOpen}`);
  lines.push(`- Repository: ${nextReport.repository.fullName}`);
  lines.push(`- Branch: ${nextReport.repository.branch}`);
  lines.push(`- Required status check: ${nextReport.repository.requiredStatusCheck}`);
  lines.push(`- Working tree clean: ${nextReport.repository.clean ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Phase Map");
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
    if (phase.links?.length) {
      pushList(lines, "Links", phase.links);
    }
    pushList(lines, "Evidence", phase.evidence);
    lines.push("Commands:");
    lines.push("");
    pushCommandBlock(lines, phase.commands);
    lines.push("");
    if (phase.writeCommands?.length) {
      lines.push("Write commands after review:");
      lines.push("");
      pushCommandBlock(lines, phase.writeCommands);
      lines.push("");
    }
    lines.push(`Secret boundary: ${phase.secretBoundary}`);
    lines.push("");
  }

  lines.push("## Safety Boundary");
  lines.push("");
  pushList(lines, "Rules", nextReport.safety);
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
