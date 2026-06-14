#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");
const strict = args.has("--strict");
const cwd = process.cwd();
const checks = [];

function addCheck(name, status, detail, category = "release") {
  checks.push({ name, status, detail, category });
}

function repoPath(relativePath) {
  return path.resolve(cwd, relativePath);
}

function exists(relativePath) {
  return existsSync(repoPath(relativePath));
}

function readText(relativePath) {
  try {
    return readFileSync(repoPath(relativePath), "utf8");
  } catch {
    return "";
  }
}

function readJson(relativePath) {
  try {
    return JSON.parse(readText(relativePath));
  } catch {
    return undefined;
  }
}

function hasScript(packageJson, scriptName) {
  return Boolean(packageJson?.scripts?.[scriptName]);
}

function run(command, commandArgs) {
  return spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8"
  });
}

function checkFile(relativePath, label = relativePath) {
  addCheck(label, exists(relativePath) ? "pass" : "fail", relativePath, "files");
}

function checkScript(packageJson, scriptName) {
  addCheck(
    `script ${scriptName}`,
    hasScript(packageJson, scriptName) ? "pass" : "fail",
    hasScript(packageJson, scriptName) ? "available" : "missing",
    "scripts"
  );
}

function checkContains(relativePath, label, needles, category = "docs") {
  const text = readText(relativePath);
  const missing = needles.filter((needle) => !text.includes(needle));
  addCheck(
    label,
    missing.length === 0 ? "pass" : "fail",
    missing.length === 0 ? relativePath : `missing: ${missing.join(", ")}`,
    category
  );
}

function gitOutput(commandArgs) {
  const result = run("git", commandArgs);
  if (result.error || result.status !== 0) {
    return undefined;
  }
  return result.stdout.trim();
}

const packageJson = readJson("package.json");
const version = packageJson?.version;
const releaseTag = version ? `v${version}` : undefined;

if (!packageJson) {
  addCheck("package.json", "fail", "missing or invalid", "package");
} else {
  addCheck("package name", packageJson.name === "@xiaoqi-ai/ai-link" ? "pass" : "fail", packageJson.name ?? "missing", "package");
  addCheck("package version", version === "0.1.0" ? "pass" : "warn", version ?? "missing", "package");
  addCheck("license", packageJson.license === "Apache-2.0" ? "pass" : "fail", packageJson.license ?? "missing", "package");
  addCheck("bin ai-link", packageJson.bin?.["ai-link"] === "dist/cli.js" ? "pass" : "fail", packageJson.bin?.["ai-link"] ?? "missing", "package");
  addCheck(
    "CHANGELOG packaged",
    (packageJson.files ?? []).includes("CHANGELOG.md") ? "pass" : "fail",
    JSON.stringify(packageJson.files ?? []),
    "package"
  );
}

for (const file of [
  "CHANGELOG.md",
  "docs/quickstart.md",
  "docs/releases/v0.1.0.md",
  "docs/00-governance/release-process.md",
  "docs/00-governance/open-questions.md",
  "tools/check-package-install.js",
  "tools/new-github-hardening-worksheet.js",
  "tools/check-release-decisions.js",
  "tools/check-release-plan.js",
  "tools/show-release-manual-gates.js",
  "tools/new-release-evidence.js"
]) {
  checkFile(file);
}

checkContains("CHANGELOG.md", "CHANGELOG v0.1.0 entry", [
  "## 0.1.0 - Unreleased",
  "AI Link v0.1.0",
  "Added",
  "Safety",
  "Pending Decisions"
]);

checkContains("docs/releases/v0.1.0.md", "GitHub release draft", [
  "# AI Link v0.1.0",
  "Highlights",
  "Safety Model",
  "docs/quickstart.md",
  "Maintainer Gate",
  "Known Pending Decisions",
  "npm run release:plan"
]);

checkContains("docs/releases/v0.1.0-decisions.json", "release decision record", [
  "github-branch-protection",
  "github-secret-scanning",
  "npm-publish-decision",
  "provider-live-credentials",
  "selectedChannel",
  "Do not add API keys"
]);

checkContains("docs/quickstart.md", "public quickstart release path", [
  "AI Link 5-Minute Quickstart",
  "npm ci",
  "npm run onboard:print",
  "npm run workflow:dry",
  "does not require provider API keys"
]);

checkContains("docs/00-governance/release-process.md", "release process gate", [
  "npm run release:plan",
  "npm run release:readiness",
  "npm run package:check",
  "npm run package:install-smoke",
  "npm run github:safety",
  "npm run github:hardening",
  "npm run release:decisions",
  "npm run verify:fresh",
  "npm run release:manual-gates",
  "npm run release:evidence",
  "git tag -a v0.1.0",
  "npm publish --dry-run --access public"
]);

checkContains("tools/show-release-manual-gates.js", "release manual gates handoff", [
  "github-branch-protection",
  "github-secret-scanning",
  "npm-publish-decision",
  "provider-live-credentials"
]);

checkContains("tools/new-release-evidence.js", "release evidence handoff", [
  "release-evidence.json",
  "packageContents",
  "nextActions",
  "githubSafety",
  "githubHardening",
  "releaseDecisions",
  "releaseReadiness",
  "runtime/tmp"
]);

checkContains("docs/00-governance/open-questions.md", "release open questions", [
  "npm",
  "v0.1",
  "GitHub Release",
  "release:plan"
]);

for (const scriptName of [
  "release:plan",
  "release:plan:json",
  "release:manual-gates",
  "release:manual-gates:json",
  "release:evidence",
  "release:evidence:json",
  "release:readiness",
  "release:readiness:json",
  "package:check",
  "package:install-smoke",
  "package:install-smoke:json",
  "github:safety",
  "github:hardening",
  "github:hardening:json",
  "release:decisions",
  "release:decisions:json",
  "release:decisions:strict",
  "security:scan",
  "verify:fresh"
]) {
  checkScript(packageJson, scriptName);
}

if (releaseTag) {
  const tagMatch = gitOutput(["tag", "--list", releaseTag]);
  addCheck(
    "release tag",
    tagMatch === releaseTag ? "pass" : "manual",
    tagMatch === releaseTag ? `${releaseTag} exists` : `${releaseTag} not created yet`,
    "manual"
  );
}

const gitStatus = gitOutput(["status", "--porcelain"]);
if (gitStatus === undefined) {
  addCheck("Git working tree", "manual", "Could not inspect Git status.", "manual");
} else {
  addCheck("Git working tree", gitStatus.length === 0 ? "pass" : "warn", gitStatus.length === 0 ? "clean" : "dirty", "git");
}

addCheck("GitHub Release publication", "manual", "Use docs/releases/v0.1.0.md after manual gates are approved.", "manual");
addCheck("npm publish decision", "manual", "Decide whether v0.1 stays repository-local or publishes @xiaoqi-ai/ai-link.", "manual");
addCheck("provider-live final approval", "manual", "Requires configured credentials and explicit cost boundary approval.", "manual");

const counts = { pass: 0, warn: 0, fail: 0, manual: 0 };
for (const check of checks) {
  counts[check.status] += 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  release: {
    packageName: packageJson?.name,
    version,
    tag: releaseTag,
    changelog: "CHANGELOG.md",
    releaseNotes: "docs/releases/v0.1.0.md",
    process: "docs/00-governance/release-process.md",
    manualGates: "tools/show-release-manual-gates.js",
    githubHardening: "tools/new-github-hardening-worksheet.js",
    decisions: "tools/check-release-decisions.js",
    evidence: "tools/new-release-evidence.js"
  },
  summary: {
    ok: counts.fail === 0,
    strictOk: counts.fail === 0 && counts.warn === 0,
    manualOpen: counts.manual,
    counts
  },
  checks
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("AI Link v0.1 release plan");
  console.log(`Release: ${report.release.tag ?? "unknown"}`);
  console.log(`OK: ${report.summary.ok ? "yes" : "no"}`);
  console.log(`Strict OK: ${report.summary.strictOk ? "yes" : "no"}`);
  console.log(`Counts: pass ${counts.pass}, warn ${counts.warn}, fail ${counts.fail}, manual ${counts.manual}`);
  console.log("");
  console.table(checks.map((check) => ({
    category: check.category,
    name: check.name,
    status: check.status,
    detail: check.detail
  })));
}

if (!report.summary.ok || (strict && !report.summary.strictOk)) {
  process.exitCode = 2;
}
