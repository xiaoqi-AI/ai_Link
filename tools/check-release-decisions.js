#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");
const strict = args.has("--strict");
const cwd = process.cwd();
const sourcePath = "docs/releases/v0.1.0-decisions.json";

const requiredDecisionIds = [
  "github-branch-protection",
  "github-secret-scanning",
  "npm-publish-decision",
  "provider-live-credentials"
];

const allowedStatuses = new Set(["pending", "approved", "waived", "blocked"]);
const closedStatuses = new Set(["approved", "waived"]);
const allowedChannels = new Set(["undecided", "repository-local", "github-release", "npm-public"]);
const checks = [];

function addCheck(name, status, detail, category = "release-decisions") {
  checks.push({ name, status, detail, category });
}

function repoPath(relativePath) {
  return path.resolve(cwd, relativePath);
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(repoPath(relativePath), "utf8"));
  } catch {
    return undefined;
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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
    decision: String(decision.decision ?? ""),
    selectedChannel: decision.selectedChannel === undefined ? undefined : String(decision.selectedChannel),
    requiredFor: asArray(decision.requiredFor).map(String),
    evidence: asArray(decision.evidence).map(String),
    notes: String(decision.notes ?? "")
  };
}

function isClosed(decision) {
  return decision && closedStatuses.has(decision.status);
}

function blockedIds(ids, byId) {
  return ids.filter((id) => !isClosed(byId.get(id)));
}

function buildOutcomes(byId) {
  const releaseBlockers = blockedIds([
    "github-branch-protection",
    "github-secret-scanning",
    "npm-publish-decision"
  ], byId);
  const providerLiveBlockers = blockedIds([
    "github-secret-scanning",
    "provider-live-credentials"
  ], byId);
  const npmDecision = byId.get("npm-publish-decision");
  const npmBlockers = [...releaseBlockers];
  let npmStatus = "blocked";
  let npmDetail = npmBlockers.length === 0 ? "Release gates accepted." : `Waiting on ${npmBlockers.join(", ")}.`;

  if (isClosed(npmDecision) && npmDecision.selectedChannel !== "npm-public") {
    npmStatus = "not-selected";
    npmDetail = `selectedChannel is ${npmDecision.selectedChannel ?? "missing"}.`;
  } else if (npmBlockers.length === 0 && npmDecision?.selectedChannel === "npm-public") {
    npmStatus = "ready";
    npmDetail = "npm-public selected and required release decisions are closed.";
  }

  return [
    {
      id: "v0-1-tag-or-github-release",
      title: "v0.1 tag or GitHub Release",
      status: releaseBlockers.length === 0 ? "ready" : "blocked",
      detail: releaseBlockers.length === 0 ? "Required release decisions are closed." : `Waiting on ${releaseBlockers.join(", ")}.`,
      blockedBy: releaseBlockers
    },
    {
      id: "npm-publish",
      title: "npm publish",
      status: npmStatus,
      detail: npmDetail,
      blockedBy: npmStatus === "blocked" ? npmBlockers : []
    },
    {
      id: "provider-live-dispatch",
      title: "provider-live dispatch",
      status: providerLiveBlockers.length === 0 ? "ready" : "blocked",
      detail: providerLiveBlockers.length === 0 ? "Provider-live decision is closed and secret scanning gate is closed." : `Waiting on ${providerLiveBlockers.join(", ")}.`,
      blockedBy: providerLiveBlockers
    }
  ];
}

const sourceExists = existsSync(repoPath(sourcePath));
addCheck("decision record file", sourceExists ? "pass" : "fail", sourcePath, "files");

const raw = readJson(sourcePath);
const decisions = [];
if (!isRecord(raw)) {
  addCheck("decision record JSON", "fail", "missing or invalid JSON", "files");
} else {
  addCheck("schema version", raw.schemaVersion === 1 ? "pass" : "fail", String(raw.schemaVersion ?? "missing"));
  addCheck("release target", raw.release === "v0.1.0" ? "pass" : "fail", String(raw.release ?? "missing"));
  addCheck(
    "public safety boundary",
    asArray(raw.safety).some((line) => String(line).includes("Do not add API keys")) ? "pass" : "fail",
    sourcePath,
    "security"
  );

  for (const item of asArray(raw.decisions)) {
    const normalized = normalizeDecision(item);
    if (normalized) {
      decisions.push(normalized);
    }
  }
}

const byId = new Map(decisions.map((decision) => [decision.id, decision]));
for (const id of requiredDecisionIds) {
  const decision = byId.get(id);
  if (!decision) {
    addCheck(`decision ${id}`, "fail", "missing");
    continue;
  }

  addCheck(`decision ${id}`, "pass", decision.title || id);
  addCheck(
    `status ${id}`,
    allowedStatuses.has(decision.status) ? "pass" : "fail",
    decision.status || "missing"
  );
  addCheck(
    `owner ${id}`,
    decision.owner ? "pass" : "fail",
    decision.owner || "missing"
  );
  addCheck(
    `intent ${id}`,
    decision.decision ? "pass" : "fail",
    decision.decision ? "present" : "missing"
  );
  addCheck(
    `requiredFor ${id}`,
    decision.requiredFor.length > 0 ? "pass" : "fail",
    decision.requiredFor.join(", ") || "missing"
  );

  if (decision.status === "approved") {
    addCheck(
      `evidence ${id}`,
      decision.evidence.length > 0 ? "pass" : "fail",
      decision.evidence.length > 0 ? `${decision.evidence.length} item(s)` : "approved decisions need public-safe evidence"
    );
  }

  if (decision.status === "waived") {
    addCheck(
      `waiver note ${id}`,
      decision.notes ? "pass" : "fail",
      decision.notes ? "present" : "waived decisions need a public-safe reason"
    );
  }
}

const npmDecision = byId.get("npm-publish-decision");
if (npmDecision) {
  addCheck(
    "npm selectedChannel",
    allowedChannels.has(npmDecision.selectedChannel ?? "undecided") ? "pass" : "fail",
    npmDecision.selectedChannel ?? "undecided"
  );
}

const counts = { pass: 0, fail: 0, pending: 0, approved: 0, waived: 0, blocked: 0 };
for (const check of checks) {
  counts[check.status] += 1;
}
for (const decision of decisions) {
  if (Object.hasOwn(counts, decision.status)) {
    counts[decision.status] += 1;
  }
}

const outcomes = buildOutcomes(byId);
const manualOpen = counts.pending + counts.blocked;
const report = {
  generatedAt: new Date().toISOString(),
  source: sourcePath,
  summary: {
    ok: counts.fail === 0,
    strictOk: counts.fail === 0 && manualOpen === 0,
    manualOpen,
    counts
  },
  safety: [
    "Does not read API keys, tokens, .env files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, or runtime/private.",
    "Does not modify GitHub settings, create tags, publish npm packages, write Bitwarden secrets, or dispatch live providers.",
    "Approved decisions must cite only public-safe evidence and never include secret values."
  ],
  decisions,
  outcomes,
  checks
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

if (!report.summary.ok || (strict && !report.summary.strictOk)) {
  process.exitCode = 2;
}

function renderMarkdown(decisionReport) {
  const lines = [];
  lines.push("# AI Link v0.1 Release Decisions");
  lines.push("");
  lines.push(`Generated: ${decisionReport.generatedAt}`);
  lines.push(`Source: ${decisionReport.source}`);
  lines.push("");
  lines.push("This report is safe for public logs. It does not read or print secret values.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- OK: ${decisionReport.summary.ok ? "yes" : "no"}`);
  lines.push(`- Strict OK: ${decisionReport.summary.strictOk ? "yes" : "no"}`);
  lines.push(`- Manual open: ${decisionReport.summary.manualOpen}`);
  lines.push(`- Counts: approved ${decisionReport.summary.counts.approved}, pending ${decisionReport.summary.counts.pending}, waived ${decisionReport.summary.counts.waived}, blocked ${decisionReport.summary.counts.blocked}, fail ${decisionReport.summary.counts.fail}`);
  lines.push("");
  lines.push("## Outcomes");
  lines.push("");
  lines.push("| Outcome | Status | Detail |");
  lines.push("| --- | --- | --- |");
  for (const outcome of decisionReport.outcomes) {
    lines.push(`| ${escapeCell(outcome.title)} | ${escapeCell(outcome.status)} | ${escapeCell(outcome.detail)} |`);
  }
  lines.push("");
  lines.push("## Decisions");
  lines.push("");
  lines.push("| Decision | Status | Owner | Evidence |");
  lines.push("| --- | --- | --- | --- |");
  for (const decision of decisionReport.decisions) {
    lines.push(`| ${escapeCell(decision.title)} | ${escapeCell(decision.status)} | ${escapeCell(decision.owner)} | ${decision.evidence.length} |`);
  }
  lines.push("");
  lines.push("Run `npm run release:decisions:strict` only when preparing to tag, publish, or claim live provider verification.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
