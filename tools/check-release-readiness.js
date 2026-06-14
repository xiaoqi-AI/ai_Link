#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
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

function checkContains(relativePath, label, needles, category = "workflow") {
  const text = readText(relativePath);
  const missing = needles.filter((needle) => !text.includes(needle));
  addCheck(
    label,
    missing.length === 0 ? "pass" : "fail",
    missing.length === 0 ? relativePath : `missing: ${missing.join(", ")}`,
    category
  );
}

const packageJson = readJson("package.json");
if (!packageJson) {
  addCheck("package.json", "fail", "missing or invalid", "package");
} else {
  addCheck("package name", packageJson.name === "@xiaoqi-ai/ai-link" ? "pass" : "fail", packageJson.name ?? "missing", "package");
  addCheck("package version", /^\d+\.\d+\.\d+/.test(packageJson.version ?? "") ? "pass" : "fail", packageJson.version ?? "missing", "package");
  addCheck("license", packageJson.license === "Apache-2.0" ? "pass" : "fail", packageJson.license ?? "missing", "package");
  addCheck("bin ai-link", packageJson.bin?.["ai-link"] === "dist/cli.js" ? "pass" : "fail", packageJson.bin?.["ai-link"] ?? "missing", "package");
  addCheck("node engine", packageJson.engines?.node ? "pass" : "warn", packageJson.engines?.node ?? "missing", "package");
}

for (const file of [
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "AGENTS.md",
  "tools/check-package-contents.js",
  "tools/check-package-install.js",
  "tools/check-github-repo-safety.js",
  "tools/show-setup-handoff.js",
  "tools/show-bws-next.js",
  "tools/new-github-hardening-worksheet.js",
  "tools/check-release-decisions.js",
  "tools/show-release-decision-next.js",
  "tools/update-release-decision.js",
  "tools/check-release-plan.js",
  "tools/show-release-manual-gates.js",
  "tools/new-release-evidence.js",
  "tools/show-next-actions.js",
  "docs/quickstart.md",
  "docs/user-guide.md",
  "docs/releases/v0.1.0-decisions.json",
  "docs/releases/v0.1.0.md",
  "docs/00-governance/release-process.md",
  "docs/20-architecture/configuration.md",
  "docs/20-architecture/provider-adapters.md",
  "docs/20-architecture/provider-live-verification.md",
  "docs/20-architecture/codex-skill-integration.md",
  "examples/auto-ops/README.md",
  "examples/codex-skills/auto-ops-ai-link/SKILL.md",
  "examples/codex-skills/bws-secret-mode/SKILL.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/bug_report.md",
  ".github/ISSUE_TEMPLATE/feature_request.md",
  ".github/ISSUE_TEMPLATE/documentation_update.md"
]) {
  checkFile(file);
}

const licenseText = readText("LICENSE");
addCheck(
  "Apache license text",
  licenseText.includes("Apache License") && licenseText.includes("Version 2.0") ? "pass" : "fail",
  "LICENSE",
  "files"
);

for (const scriptName of [
  "check",
  "test",
  "onboard:check",
  "providers:dry",
  "providers:dry:json",
  "providers:github:check",
  "providers:github:dispatch-plan",
  "skills:check",
  "security:scan",
  "verify:fresh",
  "package:check",
  "package:check:json",
  "package:install-smoke",
  "package:install-smoke:json",
  "next:actions",
  "next:actions:json",
  "setup:handoff",
  "setup:handoff:json",
  "bws:next",
  "bws:next:json",
  "github:safety",
  "github:safety:json",
  "github:hardening",
  "github:hardening:json",
  "release:plan",
  "release:plan:json",
  "release:decisions",
  "release:decisions:json",
  "release:decisions:strict",
  "release:decisions:next",
  "release:decisions:next:json",
  "release:decisions:update",
  "release:manual-gates",
  "release:manual-gates:json",
  "release:evidence",
  "release:evidence:json",
  "release:readiness",
  "release:readiness:json"
]) {
  checkScript(packageJson, scriptName);
}

checkContains(".github/workflows/ci.yml", "CI workflow public checks", [
  "npm ci",
  "npm run check",
  "npm test",
  "npm run ai-link -- config validate",
  "npm run providers:dry",
  "npm run security:scan",
  "npm run package:check",
  "npm run package:install-smoke",
  "npm run next:actions",
  "npm run setup:handoff",
  "npm run bws:next",
  "npm run github:safety",
  "npm run github:hardening",
  "npm run release:plan",
  "npm run release:decisions",
  "npm run release:decisions:next",
  "npm run release:decisions:update",
  "npm run release:manual-gates",
  "npm run release:evidence",
  "npm run release:readiness",
  "npm audit --omit=dev --audit-level=high"
]);

checkContains("README.md", "README quickstart link", [
  "docs/quickstart.md",
  "5 分钟快速试用"
]);

checkContains("docs/user-guide.md", "user guide quickstart link", [
  "docs/quickstart.md",
  "5 分钟快速试用"
]);

checkContains("docs/quickstart.md", "public quickstart commands", [
  "npm ci",
  "npm run onboard:print",
  "npm run ai-link -- config validate",
  "npm run providers:dry",
  "npm run workflow:dry",
  "npm run ai-link -- skill draft",
  "npm run ai-link -- run auto_ops.article_draft --provider mock"
]);

checkContains("tools/show-release-manual-gates.js", "release manual gates report", [
  "github-branch-protection",
  "github-secret-scanning",
  "npm-publish-decision",
  "provider-live-credentials",
  "Does not read API keys"
]);

checkContains("tools/new-release-evidence.js", "release evidence report", [
  "release-evidence.json",
  "runtime/tmp",
  "packageInstallSmoke",
  "nextActions",
  "githubHardening",
  "releaseDecisions",
  "releaseDecisionNext",
  "releaseDecisionUpdatePreview",
  "releaseManualGates",
  "Does not read API keys"
]);

checkContains("tools/new-github-hardening-worksheet.js", "GitHub hardening worksheet", [
  "AI Link GitHub Hardening Worksheet",
  "public-main-ruleset",
  "public-secret-scanning",
  "internal-secret-scanning",
  "Does not read API keys",
  "runtime/tmp"
]);

checkContains("tools/check-github-repo-safety.js", "GitHub safety REST fallback", [
  "GitHub REST API fallback",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "AI_LINK_GITHUB_SAFETY_API_BASE_URL",
  "value was not printed"
]);

checkContains("tools/check-release-decisions.js", "release decisions report", [
  "v0.1.0-decisions.json",
  "release:decisions:strict",
  "provider-live-dispatch",
  "Does not read API keys"
]);

checkContains("tools/update-release-decision.js", "release decision update helper", [
  "v0.1.0-decisions.json",
  "approved decisions need public-safe evidence",
  "Does not read API keys",
  "--yes"
]);

checkContains("tools/show-release-decision-next.js", "release decision next commands", [
  "v0.1.0-decisions.json",
  "release:decisions:update",
  "repository-local",
  "Does not read API keys"
]);

checkContains("tools/show-next-actions.js", "next actions report", [
  "github:hardening",
  "record-v0-1-release-decisions",
  "configure-bitwarden-secrets-manager",
  "configure-provider-live-environment",
  "approve-provider-live-cost",
  "decide-v0-1-release-channel",
  "Does not read API keys"
]);

checkContains("tools/show-setup-handoff.js", "setup handoff report", [
  "AI Link Setup Handoff",
  "bitwarden-foundation",
  "github-provider-live-wiring",
  "github-hardening",
  "release-decision-record",
  "provider-live-cost-and-verification",
  "release-channel",
  "Does not read API keys"
]);

checkContains("tools/show-bws-next.js", "BWS next steps report", [
  "AI Link BWS Next Steps",
  "BWS_ACCESS_TOKEN",
  "present; value not printed",
  "provider-live Environment",
  "Does not read API keys"
]);

checkContains(".github/workflows/provider-live.yml", "provider live safe workflow", [
  "environment: provider-live",
  "bitwarden/sm-action@v2",
  "providers:live:safe-report",
  "providers:live:safe-report:strict",
  "provider-live-summary",
  "runtime/tmp/provider-live-report.json"
]);

checkContains(".gitignore", "secret and runtime ignore rules", [
  ".env",
  ".ai-link/local.yaml",
  "runtime/private/",
  "runtime/tmp/",
  "node_modules/"
], "security");

checkContains(".ai-link/project.yaml", "public AI Link project config", [
  "providers:",
  "routes:",
  "workflows:",
  "auto_ops.research",
  "auto_ops.article_draft"
], "config");

checkContains(".ai-link/bitwarden-secrets.manifest.json", "BWS manifest", [
  "bws-managed-secrets",
  "providerLive",
  "BW_ACCESS_TOKEN",
  "BWS_XAI_API_KEY_SECRET_ID"
], "security");

addCheck(
  "GitHub branch protection",
  "manual",
  "Configure main branch protection or ruleset in GitHub UI when ready.",
  "manual"
);
addCheck(
  "GitHub secret scanning and push protection",
  "manual",
  "Enable in GitHub UI for the public repo and internal companion repo.",
  "manual"
);
addCheck(
  "npm publish decision",
  "manual",
  "Open question: publish package or keep repository-local workflow for v0.1.",
  "manual"
);
addCheck(
  "provider live credentials",
  "manual",
  "Requires Bitwarden/GitHub Environment setup and explicit model cost approval.",
  "manual"
);

const counts = { pass: 0, warn: 0, fail: 0, manual: 0 };
for (const check of checks) {
  counts[check.status] += 1;
}

const report = {
  generatedAt: new Date().toISOString(),
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
  console.log("AI Link release readiness");
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
