#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");
const cwd = process.cwd();
const sourcePath = "docs/releases/v0.1.0-decisions.json";
const closedStatuses = new Set(["approved", "waived"]);

const suggestionCatalog = {
  "github-branch-protection": [
    {
      id: "approve-after-ruleset",
      title: "Approve after GitHub ruleset or branch protection is confirmed",
      status: "approved",
      evidence: "Repository maintainer confirmed main branch protection or ruleset requires Verify."
    },
    {
      id: "block-until-ruleset",
      title: "Keep blocked until GitHub protection is configured",
      status: "blocked",
      note: "Waiting for repository maintainer to configure main branch protection or a ruleset with Verify required."
    },
    {
      id: "waive-for-repository-local",
      title: "Waive only for repository-local v0.1 with no tag or npm publish",
      status: "waived",
      note: "Release owner waived branch protection only for repository-local v0.1; do not create a tag, GitHub Release, npm package, or provider-live claim."
    }
  ],
  "github-secret-scanning": [
    {
      id: "approve-after-scanning",
      title: "Approve after secret scanning and push protection are confirmed",
      status: "approved",
      evidence: "Repository maintainer confirmed secret scanning and push protection are enabled for the public repo and reviewed for the internal companion repo."
    },
    {
      id: "block-until-scanning",
      title: "Keep blocked until secret scanning is configured",
      status: "blocked",
      note: "Waiting for repository maintainer to enable secret scanning and push protection."
    }
  ],
  "npm-publish-decision": [
    {
      id: "repository-local",
      title: "Keep v0.1 repository-local",
      status: "approved",
      selectedChannel: "repository-local",
      evidence: "Release owner selected repository-local after package smoke checks and manual gate review."
    },
    {
      id: "github-release",
      title: "Use GitHub Release without npm publish",
      status: "approved",
      selectedChannel: "github-release",
      evidence: "Release owner selected GitHub Release after release notes and manual gates were reviewed."
    },
    {
      id: "npm-public",
      title: "Publish v0.1 to npm",
      status: "approved",
      selectedChannel: "npm-public",
      evidence: "Release owner reviewed npm ownership, rollback policy, package contents, install smoke, and npm publish dry-run."
    },
    {
      id: "block-release-channel",
      title: "Keep blocked while release channel is undecided",
      status: "blocked",
      note: "Waiting for release owner to choose repository-local, github-release, or npm-public."
    }
  ],
  "provider-live-credentials": [
    {
      id: "approve-after-cost",
      title: "Approve after credentials and cost boundary are confirmed",
      status: "approved",
      evidence: "Secret owner and cost approver confirmed Bitwarden/GitHub provider-live setup and minimal live verification cost boundary."
    },
    {
      id: "block-until-provider-live",
      title: "Keep blocked until provider-live is ready",
      status: "blocked",
      note: "Waiting for Bitwarden/GitHub provider-live setup and explicit cost approval."
    },
    {
      id: "waive-live-claim",
      title: "Waive provider-live for repository-local v0.1 with no live verification claim",
      status: "waived",
      note: "Release owner waived provider-live verification for repository-local v0.1; do not claim live provider verification."
    }
  ]
};

const record = readDecisionRecord();
const decisions = Array.isArray(record?.decisions) ? record.decisions.map(normalizeDecision).filter(Boolean) : [];
const suggestions = decisions.map((decision) => buildDecisionNext(decision));
const missingSuggestions = suggestions.filter((item) => item.suggestions.length === 0).map((item) => item.id);
const open = suggestions.filter((item) => !closedStatuses.has(item.status));
const counts = {
  decisions: suggestions.length,
  open: open.length,
  closed: suggestions.length - open.length,
  suggestions: suggestions.reduce((total, item) => total + item.suggestions.length, 0),
  missingSuggestions: missingSuggestions.length
};

const report = {
  generatedAt: new Date().toISOString(),
  source: sourcePath,
  summary: {
    ok: Boolean(record) && missingSuggestions.length === 0,
    manualOpen: open.length,
    counts
  },
  recommendation: "For the current v0.1 public MVP, the lowest-risk release-channel path remains repository-local until GitHub hardening, Bitwarden setup, provider-live credentials, and cost approval are confirmed.",
  safety: [
    "Does not read API keys, tokens, .env files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, or runtime/private.",
    "Does not modify docs/releases/v0.1.0-decisions.json, GitHub settings, tags, npm packages, Bitwarden secrets, or provider-live workflows.",
    "Generated commands are preview-only unless the maintainer explicitly adds --yes or uses the provided writeCommand."
  ],
  decisions: suggestions
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

if (!report.summary.ok) {
  process.exitCode = 2;
}

function readDecisionRecord() {
  const target = repoPath(sourcePath);
  if (!existsSync(target)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(target, "utf8"));
  } catch {
    return undefined;
  }
}

function buildDecisionNext(decision) {
  const items = suggestionCatalog[decision.id] ?? [];
  return {
    id: decision.id,
    title: decision.title,
    status: decision.status,
    owner: decision.owner,
    selectedChannel: decision.selectedChannel,
    evidenceCount: decision.evidence.length,
    needsAction: !closedStatuses.has(decision.status),
    suggestions: items.map((item) => ({
      ...item,
      previewCommand: buildUpdateCommand(decision.id, item, false),
      writeCommand: buildUpdateCommand(decision.id, item, true)
    }))
  };
}

function buildUpdateCommand(decisionId, suggestion, write) {
  const parts = [
    "npm run release:decisions:update --",
    "--id",
    shellArg(decisionId),
    "--status",
    shellArg(suggestion.status)
  ];

  if (suggestion.selectedChannel) {
    parts.push("--selected-channel", shellArg(suggestion.selectedChannel));
  }

  if (suggestion.evidence) {
    parts.push("--evidence", shellArg(suggestion.evidence));
  }

  if (suggestion.note) {
    parts.push("--note", shellArg(suggestion.note));
  }

  if (write) {
    parts.push("--yes");
  }

  return parts.join(" ");
}

function normalizeDecision(decision) {
  if (!isRecord(decision)) {
    return undefined;
  }

  return {
    id: String(decision.id ?? ""),
    title: String(decision.title ?? ""),
    status: String(decision.status ?? ""),
    owner: String(decision.owner ?? ""),
    selectedChannel: decision.selectedChannel === undefined ? undefined : String(decision.selectedChannel),
    evidence: Array.isArray(decision.evidence) ? decision.evidence.map(String) : []
  };
}

function renderMarkdown(nextReport) {
  const lines = [];
  lines.push("# AI Link Release Decision Next Commands");
  lines.push("");
  lines.push(`Generated: ${nextReport.generatedAt}`);
  lines.push(`Source: ${nextReport.source}`);
  lines.push("");
  lines.push("This report is safe for public logs. It does not read or print secret values.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- OK: ${nextReport.summary.ok ? "yes" : "no"}`);
  lines.push(`- Manual open: ${nextReport.summary.manualOpen}`);
  lines.push(`- Suggestions: ${nextReport.summary.counts.suggestions}`);
  lines.push("");
  lines.push(`Recommendation: ${nextReport.recommendation}`);
  lines.push("");
  lines.push("## Decisions");
  lines.push("");
  lines.push("| Decision | Status | Owner | Suggestions |");
  lines.push("| --- | --- | --- | --- |");
  for (const decision of nextReport.decisions) {
    lines.push(`| ${escapeCell(decision.title)} | ${escapeCell(decision.status)} | ${escapeCell(decision.owner)} | ${decision.suggestions.length} |`);
  }
  lines.push("");

  for (const decision of nextReport.decisions) {
    lines.push(`## ${decision.title}`);
    lines.push("");
    lines.push(`Current status: ${decision.status}`);
    if (decision.selectedChannel) {
      lines.push(`Selected channel: ${decision.selectedChannel}`);
    }
    lines.push("");
    for (const suggestion of decision.suggestions) {
      lines.push(`### ${suggestion.title}`);
      lines.push("");
      lines.push("Preview:");
      lines.push("");
      pushCommandBlock(lines, [suggestion.previewCommand]);
      lines.push("");
      lines.push("Write after review:");
      lines.push("");
      pushCommandBlock(lines, [suggestion.writeCommand]);
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}

function pushCommandBlock(lines, commands) {
  lines.push("```powershell");
  lines.push(...commands);
  lines.push("```");
}

function repoPath(relativePath) {
  return path.resolve(cwd, relativePath);
}

function shellArg(value) {
  return `"${String(value).replace(/"/g, "`\"")}"`;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
