#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");
const strict = args.has("--strict");
const cwd = process.cwd();
const owner = "xiaoqi-AI";
const repo = "ai_Link";
const branch = "main";
const fullName = `${owner}/${repo}`;
const checks = [];

function addCheck(name, status, detail, category = "github") {
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

function run(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    ...options
  });
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

function parseJsonOutput(result) {
  if (result.status !== 0 || result.error) {
    return undefined;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
}

function remoteUrl() {
  const result = run("git", ["config", "--get", "remote.origin.url"]);
  if (result.error || result.status !== 0) {
    return undefined;
  }
  return result.stdout.trim();
}

function checkLocalBaseline(packageJson) {
  addCheck("repository target", "pass", fullName, "local");
  addCheck("default branch target", "pass", branch, "local");
  addCheck("SECURITY.md", exists("SECURITY.md") ? "pass" : "fail", "SECURITY.md", "files");
  addCheck("CI workflow", exists(".github/workflows/ci.yml") ? "pass" : "fail", ".github/workflows/ci.yml", "files");
  addCheck("branch protection guide", exists("docs/00-governance/github-branch-protection.md") ? "pass" : "fail", "docs/00-governance/github-branch-protection.md", "files");

  const origin = remoteUrl();
  if (!origin) {
    addCheck("origin remote", "manual", "No origin remote available in this checkout.", "local");
  } else {
    addCheck(
      "origin remote",
      origin.includes("github.com") && origin.includes(`${owner}/${repo}`) ? "pass" : "warn",
      origin,
      "local"
    );
  }

  for (const script of ["github:safety", "github:safety:json", "release:readiness", "security:scan"]) {
    addCheck(
      `script ${script}`,
      packageJson?.scripts?.[script] ? "pass" : "fail",
      packageJson?.scripts?.[script] ? "available" : "missing",
      "scripts"
    );
  }

  checkContains(".github/workflows/ci.yml", "CI verify job", [
    "name: Verify",
    "npm run check",
    "npm test",
    "npm run security:scan",
    "npm run package:check",
    "npm run release:readiness"
  ], "workflow");

  checkContains("docs/00-governance/github-branch-protection.md", "branch protection guide contents", [
    "Require a pull request before merging",
    "Require status checks to pass before merging",
    "Verify",
    "Restrict force pushes",
    "Restrict deletions",
    "secret scanning",
    "push protection"
  ], "docs");
}

function checkGhRemote() {
  if (process.env.AI_LINK_GITHUB_SAFETY_DISABLE_REMOTE === "1") {
    addCheck("GitHub remote checks", "manual", "Skipped by AI_LINK_GITHUB_SAFETY_DISABLE_REMOTE=1.", "remote");
    return;
  }

  const ghCommand = process.env.AI_LINK_GITHUB_SAFETY_GH_COMMAND || "gh";
  const version = run(ghCommand, ["--version"]);
  if (version.error || version.status !== 0) {
    addCheck("GitHub CLI availability", "manual", "Install gh or run from an authenticated environment to verify remote UI settings.", "remote");
    addCheck("GitHub branch protection", "manual", "Could not verify remote branch protection without gh.", "manual");
    addCheck("GitHub secret scanning", "manual", "Could not verify secret scanning without gh.", "manual");
    addCheck("GitHub push protection", "manual", "Could not verify push protection without gh.", "manual");
    return;
  }

  addCheck("GitHub CLI availability", "pass", firstLine(version.stdout), "remote");

  const auth = run(ghCommand, ["auth", "status", "-h", "github.com"]);
  addCheck(
    "GitHub CLI auth",
    auth.status === 0 ? "pass" : "manual",
    auth.status === 0 ? "authenticated" : "Run gh auth login to verify remote UI settings.",
    "remote"
  );
  if (auth.status !== 0) {
    addCheck("GitHub branch protection", "manual", "Could not verify remote branch protection without authenticated gh.", "manual");
    addCheck("GitHub secret scanning", "manual", "Could not verify secret scanning without authenticated gh.", "manual");
    addCheck("GitHub push protection", "manual", "Could not verify push protection without authenticated gh.", "manual");
    return;
  }

  const repoResult = run(ghCommand, ["api", `repos/${fullName}`]);
  const repoInfo = parseJsonOutput(repoResult);
  if (!repoInfo) {
    addCheck("GitHub repository metadata", "warn", cleanFailure(repoResult), "remote");
  } else {
    addCheck("GitHub repository visibility", repoInfo.private === false ? "pass" : "warn", repoInfo.private === false ? "public" : "not public", "remote");
    addCheck("GitHub default branch", repoInfo.default_branch === branch ? "pass" : "warn", repoInfo.default_branch ?? "missing", "remote");
    checkSecurityAndAnalysis(repoInfo.security_and_analysis);
  }

  const protectionResult = run(ghCommand, ["api", `repos/${fullName}/branches/${branch}/protection`]);
  const protection = parseJsonOutput(protectionResult);
  if (!protection) {
    addCheck("GitHub branch protection", "warn", cleanFailure(protectionResult), "remote");
    return;
  }

  const requiredChecks = [
    ...(protection.required_status_checks?.contexts ?? []),
    ...((protection.required_status_checks?.checks ?? []).map((check) => check.context).filter(Boolean))
  ];
  addCheck("GitHub branch protection", "pass", `${branch} protection is configured.`, "remote");
  addCheck("required status check Verify", requiredChecks.includes("Verify") ? "pass" : "warn", requiredChecks.join(", ") || "none", "remote");
  addCheck("pull request required", protection.required_pull_request_reviews ? "pass" : "warn", protection.required_pull_request_reviews ? "enabled" : "missing", "remote");
  addCheck("force pushes restricted", protection.allow_force_pushes?.enabled === false ? "pass" : "warn", protection.allow_force_pushes?.enabled === false ? "disabled" : "enabled or unknown", "remote");
  addCheck("branch deletion restricted", protection.allow_deletions?.enabled === false ? "pass" : "warn", protection.allow_deletions?.enabled === false ? "disabled" : "enabled or unknown", "remote");
}

function checkSecurityAndAnalysis(securityAndAnalysis) {
  if (!securityAndAnalysis) {
    addCheck("GitHub secret scanning", "manual", "GitHub API did not expose security_and_analysis.", "manual");
    addCheck("GitHub push protection", "manual", "GitHub API did not expose security_and_analysis.", "manual");
    return;
  }

  const secretScanning = securityAndAnalysis.secret_scanning?.status;
  const pushProtection = securityAndAnalysis.secret_scanning_push_protection?.status;
  addCheck("GitHub secret scanning", secretScanning === "enabled" ? "pass" : "warn", secretScanning ?? "unknown", "remote");
  addCheck("GitHub push protection", pushProtection === "enabled" ? "pass" : "warn", pushProtection ?? "unknown", "remote");
}

function firstLine(text) {
  return text.trim().split(/\r?\n/)[0] || "available";
}

function cleanFailure(result) {
  if (result.error) {
    return result.error.message;
  }
  return (result.stderr || result.stdout || "unavailable").trim().replace(/\r?\n/g, " ");
}

const packageJson = readJson("package.json");
if (!packageJson) {
  addCheck("package.json", "fail", "missing or invalid", "package");
} else {
  addCheck("package name", packageJson.name === "@xiaoqi-ai/ai-link" ? "pass" : "fail", packageJson.name ?? "missing", "package");
}

checkLocalBaseline(packageJson);
checkGhRemote();

const counts = { pass: 0, warn: 0, fail: 0, manual: 0 };
for (const check of checks) {
  counts[check.status] += 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  repository: {
    owner,
    name: repo,
    branch,
    fullName
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
  console.log("AI Link GitHub repository safety");
  console.log(`Repository: ${fullName}`);
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
