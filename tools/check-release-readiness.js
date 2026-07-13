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
  "tools/show-maintainer-action-pack.js",
  "tools/show-external-setup-preflight.js",
  "tools/show-roadmap-next.js",
  "tools/show-iteration-boundary.js",
  "tools/show-bws-next.js",
  "tools/with-bitwarden-secrets.ps1",
  "tools/new-bws-acceptance-report.ps1",
  "tools/new-github-hardening-worksheet.js",
  "tools/show-github-hardening-next.js",
  "tools/check-release-decisions.js",
  "tools/show-release-decision-next.js",
  "tools/update-release-decision.js",
  "tools/check-release-plan.js",
  "tools/show-release-manual-gates.js",
  "tools/new-release-evidence.js",
  "tools/show-next-actions.js",
  "tools/show-auth-hub-remote-next.js",
  "tools/test-auth-hub-remote.ps1",
  "src/security/authHubOutbound.js",
  "src/executor/localExecutor.js",
  "docs/quickstart.md",
  "docs/user-guide.md",
  "docs/10-product/project-requirements-plan-boundary.md",
  "docs/releases/v0.1.0-decisions.json",
  "docs/releases/v0.1.0.md",
  "docs/00-governance/release-process.md",
  "docs/20-architecture/configuration.md",
  "docs/20-architecture/provider-adapters.md",
  "docs/20-architecture/provider-live-verification.md",
  "docs/20-architecture/codex-skill-integration.md",
  "docs/90-templates/ai-link-skill-authoring.md",
  "examples/auto-ops/README.md",
  "examples/codex-skills/ai-link-skill-author/SKILL.md",
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
  "maintainer:pack",
  "maintainer:pack:json",
  "external:preflight",
  "external:preflight:json",
  "roadmap:next",
  "roadmap:next:json",
  "iteration:boundary",
  "iteration:boundary:json",
  "bws:next",
  "bws:next:json",
  "bws:run",
  "bws:run:help",
  "bws:acceptance",
  "bws:acceptance:print",
  "bws:acceptance:json",
  "bws:acceptance:strict",
  "bws:acceptance:strict:json",
  "github:safety",
  "github:safety:json",
  "github:hardening",
  "github:hardening:json",
  "github:hardening:next",
  "github:hardening:next:json",
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
  "release:readiness:json",
  "auth-hub:remote:next",
  "auth-hub:remote:next:json",
  "auth-hub:remote:smoke"
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
  "npm run maintainer:pack",
  "npm run external:preflight",
  "npm run roadmap:next",
  "npm run iteration:boundary",
  "npm run bws:next",
  "npm run github:safety",
  "npm run github:hardening",
  "npm run github:hardening:next",
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

checkContains("docs/10-product/project-requirements-plan-boundary.md", "project requirements plan boundary", [
  "AI Link 项目需求、规划与边界",
  "需求",
  "规划",
  "下一步计划",
  "项目边界",
  "npm run iteration:boundary",
  "不把真实凭据"
]);

checkContains("docs/90-templates/ai-link-skill-authoring.md", "AI Link skill authoring template", [
  "AI Link Skill 制作边界卡",
  "需求",
  "预期开发工作",
  "验证",
  "边界控制",
  "npm run ai-link -- skill draft",
  ".ai-link/local.yaml",
  "不把真实 key"
]);

checkContains("examples/codex-skills/ai-link-skill-author/SKILL.md", "AI Link skill author example", [
  "name: ai-link-skill-author",
  "skill draft",
  ".ai-link/local.yaml",
  "docs/90-templates/ai-link-skill-authoring.md",
  "npm run skills:check",
  "Do not include API keys"
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

checkContains("tools/test-auth-hub-remote.ps1", "Auth Hub remote smoke script", [
  "BaseUrl is required",
  "AI_LINK_CODEX_TOKEN",
  "AI_LINK_APP_PASSWORD",
  "AI_LINK_CF_ACCESS_TEST_JWT",
  "ExpectAccessGate",
  "full_chain",
  "read_detect",
  "codex executor denied",
  "codex approval denied",
  "redacted task detail",
  "audit log"
]);

checkContains("tools/show-auth-hub-remote-next.js", "Auth Hub remote next report", [
  "AI Link Auth Hub Remote Next",
  "auth-hub:remote:next",
  "auth-hub:remote:smoke",
  "auth.xiao-qi-ai.com",
  "AI_LINK_ADMIN_TOKEN",
  "CF_ACCESS_CLIENT_SECRET",
  "This report only records whether environment variables are present, never their values",
  "A local fallback smoke is useful evidence for code health, but it does not prove the dedicated remote Auth Hub hostname is deployed"
]);

checkContains("src/security/authHubOutbound.js", "Auth Hub shared outbound credential guard", [
  "CF_ACCESS_CLIENT_ID",
  "CF_ACCESS_CLIENT_SECRET",
  "AI_LINK_AUTH_HUB_ALLOWED_HOSTS",
  "attachServiceHeaders"
]);

checkContains("src/executor/localExecutor.js", "Auth Hub executor Access test headers", [
  "validateAuthHubTarget",
  "cloudflareServiceHeaders",
  "AI_LINK_CF_ACCESS_TEST_JWT",
  "AI_LINK_CF_ACCESS_TEST_EMAIL",
  "cf-access-jwt-assertion",
  "cf-access-authenticated-user-email",
  'redirect: "manual"'
]);

checkContains("docs/20-architecture/auth-hub.md", "Auth Hub remote mock dry-run docs", [
  "auth-hub:remote:next",
  "auth-hub:remote:smoke",
  "full_chain",
  "受限 Codex token",
  "脱敏任务详情",
  "显式清除 `AI_LINK_PRIVATE_CONNECTOR_MODULE`",
  "不接入真实微信、小红书、公众号、GitHub",
  "test-auth-hub-remote.ps1",
  "ExpectAccessGate"
]);

checkContains("docs/20-architecture/auth-hub-deployment-checklist.md", "Auth Hub remote deployment smoke checklist", [
  "AI_LINK_CODEX_TOKEN",
  "AI_LINK_APP_PASSWORD",
  "auth-hub:remote:next",
  "auth-hub:remote:smoke",
  "完整远端 mock 空跑",
  "受限 Codex token",
  "任务详情和审计日志只包含脱敏摘要",
  "真实微信、公众号、GitHub、小红书、朱雀AI、抖音、知乎、头条账号登录、只读探测和正式发布不属于本轮验收"
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
  "maintainerPack",
  "externalPreflight",
  "roadmapNext",
  "githubHardening",
  "githubHardeningNext",
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

checkContains("tools/show-maintainer-action-pack.js", "maintainer action pack", [
  "AI Link Maintainer Action Pack",
  "github-ui-hardening",
  "bitwarden-local-foundation",
  "bws:acceptance:json",
  "release-decision-closeout",
  "Does not read API keys"
]);

checkContains("tools/show-external-setup-preflight.js", "external setup preflight", [
  "AI Link External Setup Preflight",
  "canStartExternalSetup",
  "working tree is not clean",
  "github-ui-hardening",
  "bitwarden-foundation",
  "Does not read API keys"
]);

checkContains("tools/show-roadmap-next.js", "roadmap next report", [
  "AI Link Roadmap Next",
  "v0-1-local-public-baseline",
  "v0-2-real-provider-acceptance",
  "AI Link skill author",
  "v0-3-agent-connectors",
  "roadmap:next:json",
  "Does not read API keys"
]);

checkContains("tools/show-iteration-boundary.js", "iteration boundary report", [
  "AI Link Iteration Boundary",
  "Boundary Card Template",
  "stopConditions",
  "requiresConfirmation",
  "Does not read API keys"
]);

checkContains("tools/show-github-hardening-next.js", "GitHub hardening next steps report", [
  "AI Link GitHub Hardening Next Steps",
  "github-branch-protection",
  "github-secret-scanning",
  "release:decisions:update",
  "Does not read API keys"
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
  "github:hardening:next",
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
  "github:hardening:next",
  "release-decision-record",
  "provider-live-cost-and-verification",
  "release-channel",
  "Does not read API keys"
]);

checkContains("tools/show-bws-next.js", "BWS next steps report", [
  "AI Link BWS Next Steps",
  "BWS_ACCESS_TOKEN",
  "present; value not printed",
  "npm run bws:run",
  "provider-live Environment",
  "Does not read API keys"
]);

checkContains("tools/with-bitwarden-secrets.ps1", "BWS run wrapper", [
  "BWS run wrapper",
  "npm run bws:run",
  "BWS_ACCESS_TOKEN",
  "Secret values are never printed",
  "present; value not printed"
]);

checkContains("tools/new-bws-acceptance-report.ps1", "BWS acceptance JSON report", [
  "BWS acceptance report",
  "npm run bws:acceptance:json",
  "ConvertTo-Json",
  "Secret values are never printed",
  "present in current session; value not printed"
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

const releaseDecisions = readJson("docs/releases/v0.1.0-decisions.json");
const branchProtectionDecision = releaseDecisions?.decisions?.find((decision) => decision.id === "github-branch-protection");
const secretScanningDecision = releaseDecisions?.decisions?.find((decision) => decision.id === "github-secret-scanning");
const npmPublishDecision = releaseDecisions?.decisions?.find((decision) => decision.id === "npm-publish-decision");

addCheck(
  "GitHub branch protection",
  branchProtectionDecision?.status === "approved" ? "pass" : "manual",
  branchProtectionDecision?.status === "approved"
    ? "Approved in docs/releases/v0.1.0-decisions.json."
    : "Configure main branch protection or ruleset in GitHub UI when ready.",
  branchProtectionDecision?.status === "approved" ? "release-decisions" : "manual"
);
addCheck(
  "GitHub secret scanning and push protection",
  secretScanningDecision?.status === "approved" ? "pass" : "manual",
  secretScanningDecision?.status === "approved"
    ? "Approved in docs/releases/v0.1.0-decisions.json."
    : "Enable in GitHub UI for the public repo and internal companion repo.",
  secretScanningDecision?.status === "approved" ? "release-decisions" : "manual"
);
addCheck(
  "npm publish decision",
  npmPublishDecision?.status === "approved" ? "pass" : "manual",
  npmPublishDecision?.status === "approved"
    ? `Approved in docs/releases/v0.1.0-decisions.json: ${npmPublishDecision.selectedChannel ?? "unknown"}.`
    : "Open question: publish package or keep repository-local workflow for v0.1.",
  npmPublishDecision?.status === "approved" ? "release-decisions" : "manual"
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
