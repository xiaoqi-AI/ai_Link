#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const sourcePath = "docs/releases/v0.1.0-decisions.json";
const outputJson = process.argv.includes("--json");
const parsed = parseArgs(process.argv.slice(2));

const allowedStatuses = new Set(["pending", "approved", "waived", "blocked"]);
const allowedChannels = new Set(["undecided", "repository-local", "github-release", "npm-public"]);
const secretPatterns = [
  /\b(?:api[_-]?key|token|secret|password|passwd|authorization|bearer)\b\s*[:=]/i,
  /\b(?:sk|rk|pk|ghp|glpat|xox[baprs]?|AKIA|ASIA)[A-Za-z0-9_-]{10,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/i,
  /\bxai-[A-Za-z0-9_-]{10,}\b/i,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /runtime[\\/]+private/i
];

if (parsed.help || (process.argv.slice(2).length === 0 && !parsed.id)) {
  printHelp();
  process.exit(0);
}

if (parsed.errors.length > 0) {
  fail("Invalid command line arguments.", parsed.errors);
}

if (!parsed.id) {
  fail("Missing required decision id.", ["Use --id <decision-id>."]);
}

if (parsed.status && !allowedStatuses.has(parsed.status)) {
  fail("Invalid decision status.", ["Allowed statuses: pending, approved, waived, blocked."]);
}

if (parsed.selectedChannel && !allowedChannels.has(parsed.selectedChannel)) {
  fail("Invalid release channel.", ["Allowed channels: undecided, repository-local, github-release, npm-public."]);
}

for (const value of [
  parsed.id,
  parsed.status,
  parsed.selectedChannel,
  parsed.note,
  ...parsed.evidence
]) {
  if (value && containsSecretLikeContent(value)) {
    fail("Input contains secret-like content.", [
      "Redact it before recording public release decisions."
    ]);
  }
}

const record = readDecisionRecord();
const decision = findDecision(record, parsed.id);
if (!decision) {
  fail("Unknown decision id.", [
    `Allowed ids: ${record.decisions.map((item) => String(item.id ?? "")).filter(Boolean).join(", ")}.`
  ]);
}

if (parsed.selectedChannel && parsed.id !== "npm-publish-decision") {
  fail("Release channel can only be set on npm-publish-decision.", [
    "Use --selected-channel only with --id npm-publish-decision."
  ]);
}

const changes = [];
const nextDecision = clone(decision);

if (parsed.status) {
  setField(nextDecision, changes, "status", parsed.status);
}

if (parsed.selectedChannel) {
  setField(nextDecision, changes, "selectedChannel", parsed.selectedChannel);
}

const originalEvidence = asArray(nextDecision.evidence).map(String);
let nextEvidence = parsed.clearEvidence ? [] : [...originalEvidence];
for (const item of parsed.evidence.map((value) => value.trim()).filter(Boolean)) {
  if (!nextEvidence.includes(item)) {
    nextEvidence.push(item);
  }
}

if (parsed.clearEvidence || parsed.evidence.length > 0) {
  nextDecision.evidence = nextEvidence;
  if (originalEvidence.length !== nextEvidence.length || originalEvidence.some((item, index) => item !== nextEvidence[index])) {
    changes.push({
      field: "evidence",
      beforeCount: originalEvidence.length,
      afterCount: nextEvidence.length,
      addedCount: Math.max(0, nextEvidence.length - (parsed.clearEvidence ? 0 : originalEvidence.length))
    });
  }
}

if (parsed.note !== undefined) {
  setField(nextDecision, changes, "notes", parsed.note.trim());
}

validateDecisionState(nextDecision);

const willWrite = Boolean(parsed.yes);
let updated = false;
if (willWrite && changes.length > 0) {
  Object.assign(decision, nextDecision);
  record.updatedAt = new Date().toISOString().slice(0, 10);
  writeDecisionRecord(record);
  updated = true;
}

const report = {
  generatedAt: new Date().toISOString(),
  source: sourcePath,
  summary: {
    ok: true,
    previewOnly: !willWrite,
    updated
  },
  safety: [
    "Does not read API keys, tokens, .env files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, or runtime/private.",
    "Does not modify GitHub settings, create tags, publish npm packages, write Bitwarden secrets, or dispatch live providers.",
    "approved decisions need public-safe evidence; waived decisions need a public-safe note."
  ],
  target: parsed.id,
  changes,
  decision: normalizeDecision(nextDecision)
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

function parseArgs(args) {
  const result = {
    id: "",
    status: "",
    selectedChannel: "",
    evidence: [],
    note: undefined,
    clearEvidence: false,
    yes: false,
    help: false,
    errors: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--id":
        result.id = readValue(args, index, arg, result.errors);
        index += 1;
        break;
      case "--status":
        result.status = readValue(args, index, arg, result.errors);
        index += 1;
        break;
      case "--selected-channel":
      case "--channel":
        result.selectedChannel = readValue(args, index, arg, result.errors);
        index += 1;
        break;
      case "--evidence":
        result.evidence.push(readValue(args, index, arg, result.errors));
        index += 1;
        break;
      case "--note":
      case "--reason":
        result.note = readValue(args, index, arg, result.errors);
        index += 1;
        break;
      case "--clear-evidence":
        result.clearEvidence = true;
        break;
      case "--yes":
        result.yes = true;
        break;
      case "--json":
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
      default:
        result.errors.push(`Unknown argument ${arg}.`);
        break;
    }
  }

  return result;
}

function readValue(args, index, name, errors) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    errors.push(`${name} requires a value.`);
    return "";
  }
  return value;
}

function readDecisionRecord() {
  const target = repoPath(sourcePath);
  assertInsideRepo(target);
  if (!existsSync(target)) {
    fail("Decision record file is missing.", [sourcePath]);
  }

  try {
    const value = JSON.parse(readFileSync(target, "utf8"));
    if (!isRecord(value) || !Array.isArray(value.decisions)) {
      fail("Decision record has an invalid shape.", ["Expected an object with a decisions array."]);
    }
    return value;
  } catch {
    fail("Decision record is not valid JSON.", [sourcePath]);
  }
}

function writeDecisionRecord(record) {
  const target = repoPath(sourcePath);
  assertInsideRepo(target);
  writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function findDecision(record, id) {
  return record.decisions.find((item) => isRecord(item) && String(item.id ?? "") === id);
}

function validateDecisionState(decision) {
  const status = String(decision.status ?? "");
  const evidence = asArray(decision.evidence).map(String).filter(Boolean);
  const notes = String(decision.notes ?? "").trim();

  if (status === "approved" && evidence.length === 0) {
    fail("Approved decisions need public-safe evidence.", [
      "Add --evidence <public-safe evidence> or keep the status pending."
    ]);
  }

  if (status === "waived" && notes.length === 0) {
    fail("Waived decisions need a public-safe note.", [
      "Add --note <reason> or keep the status pending."
    ]);
  }

  if (decision.selectedChannel !== undefined && !allowedChannels.has(String(decision.selectedChannel))) {
    fail("Decision record contains an invalid release channel.", [
      "Allowed channels: undecided, repository-local, github-release, npm-public."
    ]);
  }
}

function setField(target, changes, field, value) {
  const before = target[field] === undefined ? undefined : String(target[field]);
  if (before !== value) {
    target[field] = value;
    changes.push({ field, before, after: value });
  }
}

function normalizeDecision(decision) {
  return {
    id: String(decision.id ?? ""),
    title: String(decision.title ?? ""),
    status: String(decision.status ?? ""),
    owner: String(decision.owner ?? ""),
    selectedChannel: decision.selectedChannel === undefined ? undefined : String(decision.selectedChannel),
    evidence: asArray(decision.evidence).map(String),
    notes: String(decision.notes ?? "")
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# AI Link Release Decision Update");
  lines.push("");
  lines.push(`Source: ${report.source}`);
  lines.push(`Decision: ${report.decision.id}`);
  lines.push(`Mode: ${report.summary.previewOnly ? "preview" : "write"}`);
  lines.push(`Updated: ${report.summary.updated ? "yes" : "no"}`);
  lines.push("");
  lines.push("This command is safe for public logs. It does not read or print secret values.");
  lines.push("");
  lines.push("## Changes");
  lines.push("");
  if (report.changes.length === 0) {
    lines.push("- No changes.");
  } else {
    for (const change of report.changes) {
      if (change.field === "evidence") {
        lines.push(`- evidence: ${change.beforeCount} -> ${change.afterCount}`);
      } else {
        lines.push(`- ${change.field}: ${displayValue(change.before)} -> ${displayValue(change.after)}`);
      }
    }
  }
  lines.push("");
  lines.push("Run again with `--yes` to write the public decision record.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function printHelp() {
  const help = [
    "AI Link release decision updater",
    "",
    "Preview by default:",
    "  npm run release:decisions:update -- --id npm-publish-decision --status approved --selected-channel repository-local --evidence \"Release owner selected repository-local after package smoke checks.\"",
    "",
    "Write after review:",
    "  npm run release:decisions:update -- --id npm-publish-decision --status approved --selected-channel repository-local --evidence \"Release owner selected repository-local after package smoke checks.\" --yes",
    "",
    "Options:",
    "  --id <decision-id>                 Required decision id.",
    "  --status <pending|approved|waived|blocked>",
    "  --selected-channel <undecided|repository-local|github-release|npm-public>",
    "  --evidence <public-safe text>       Repeatable; appended to evidence.",
    "  --note <public-safe text>           Required when status is waived.",
    "  --clear-evidence                   Replace evidence with the new evidence list.",
    "  --yes                              Write changes. Without it this is preview-only.",
    "  --json                             Print machine-readable output.",
    "",
    "Safety:",
    "  Approved decisions need public-safe evidence.",
    "  Waived decisions need a public-safe note.",
    "  Do not add API keys, tokens, Bitwarden values, provider responses, screenshots, QR codes, login state, or runtime/private paths."
  ].join("\n");

  console.log(help);
}

function fail(message, details = []) {
  const report = {
    generatedAt: new Date().toISOString(),
    source: sourcePath,
    summary: {
      ok: false,
      previewOnly: !parsed.yes,
      updated: false,
      error: message
    },
    errors: details,
    safety: [
      "Does not read API keys, tokens, .env files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, or runtime/private.",
      "Secret-like input is rejected without echoing the rejected value."
    ]
  };

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.error(`Error: ${message}`);
    for (const detail of details) {
      console.error(`- ${detail}`);
    }
  }

  process.exit(2);
}

function containsSecretLikeContent(value) {
  return secretPatterns.some((pattern) => pattern.test(value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function repoPath(relativePath) {
  return path.resolve(cwd, relativePath);
}

function assertInsideRepo(target) {
  const root = path.resolve(cwd);
  const normalizedRoot = root.toLowerCase();
  const normalizedTarget = path.resolve(target).toLowerCase();
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${path.sep.toLowerCase()}`)) {
    fail("Refusing to access a path outside the repository.", [sourcePath]);
  }
}

function displayValue(value) {
  if (value === undefined || value === "") {
    return "(empty)";
  }
  return String(value);
}
