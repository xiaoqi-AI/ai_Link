import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

type OnboardingStatus = "pass" | "ready" | "info" | "warn" | "fail";

export interface OnboardingCheck {
  check: string;
  status: OnboardingStatus;
  detail: string;
}

export interface OnboardingSummary {
  ok: boolean;
  strictOk: boolean;
  counts: Record<OnboardingStatus, number>;
}

export interface OnboardingReport {
  generatedAt: string;
  summary: OnboardingSummary;
  safety: string[];
  snapshot: {
    packageName?: string;
    packageVersion?: string;
    hasProjectConfig: boolean;
    hasLocalOverride: boolean;
    providers: string[];
    routes: string[];
    workflows: string[];
    checks: OnboardingCheck[];
  };
  commands: {
    firstDryRunPath: string[];
    customizeSkillPreview: string;
    customizeSkillWrite: string;
    realProviderKeys: string[];
    closeoutChecks: string[];
  };
}

interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
}

interface ProjectConfig {
  providers?: Record<string, unknown>;
  routes?: Record<string, unknown>;
  workflows?: Record<string, unknown>;
}

export interface BuildOnboardingReportOptions {
  cwd?: string;
  generatedAt?: string;
}

const REQUIRED_SCRIPTS = [
  "ai-link",
  "providers:dry",
  "providers:dry:json",
  "providers:live:safe-report",
  "providers:live:safe-report:strict",
  "workflow:dry",
  "onboard:check",
  "package:check",
  "package:check:json",
  "package:install-smoke",
  "package:install-smoke:json",
  "next:actions",
  "next:actions:json",
  "setup:handoff",
  "setup:handoff:json",
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
  "release:readiness:json",
  "skills:check",
  "security:scan",
  "verify:fresh"
];

export function buildOnboardingReport(options: BuildOnboardingReportOptions = {}): OnboardingReport {
  const cwd = options.cwd ?? process.cwd();
  const packageJson = readPackageJson(cwd);
  const hasProjectConfig = existsRepo(cwd, ".ai-link/project.yaml");
  const projectConfig = hasProjectConfig ? readProjectConfig(cwd) : {};
  const providerNames = Object.keys(projectConfig.providers ?? {}).sort();
  const routeNames = Object.keys(projectConfig.routes ?? {}).sort();
  const workflowNames = Object.keys(projectConfig.workflows ?? {}).sort();
  const hasLocalOverride = existsRepo(cwd, ".ai-link/local.yaml");
  const checks: OnboardingCheck[] = [];

  addCheck(
    checks,
    "package.json",
    packageJson ? "pass" : "fail",
    packageJson ? `${packageJson.name ?? "package"} ${packageJson.version ?? ""}`.trim() : "missing"
  );
  addCheck(checks, "project config", hasProjectConfig ? "pass" : "fail", ".ai-link/project.yaml");
  addCheck(
    checks,
    "local override",
    hasLocalOverride ? "info" : "ready",
    hasLocalOverride ? ".ai-link/local.yaml exists" : "not present; safe default for a fresh clone"
  );
  addCheck(checks, "providers", providerNames.length > 0 ? "pass" : "fail", providerNames.join(", ") || "none");
  addCheck(checks, "routes", routeNames.length > 0 ? "pass" : "fail", routeNames.join(", ") || "none");
  addCheck(checks, "workflows", workflowNames.length > 0 ? "pass" : "fail", workflowNames.join(", ") || "none");
  addCheck(
    checks,
    "quickstart guide",
    existsRepo(cwd, "docs/quickstart.md") ? "pass" : "warn",
    "docs/quickstart.md"
  );
  addCheck(
    checks,
    "auto ops Codex skill",
    existsRepo(cwd, "examples/codex-skills/auto-ops-ai-link/SKILL.md") ? "pass" : "warn",
    "examples/codex-skills/auto-ops-ai-link/SKILL.md"
  );
  addCheck(
    checks,
    "BWS secret mode skill",
    existsRepo(cwd, "examples/codex-skills/bws-secret-mode/SKILL.md") ? "pass" : "warn",
    "examples/codex-skills/bws-secret-mode/SKILL.md"
  );

  for (const script of REQUIRED_SCRIPTS) {
    addCheck(
      checks,
      `script ${script}`,
      packageJson?.scripts?.[script] ? "pass" : "warn",
      packageJson?.scripts?.[script] ? "available" : "missing"
    );
  }

  const summary = summarizeChecks(checks);

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    summary,
    safety: [
      "Does not read API keys, tokens, .env files, login state, or provider responses.",
      "Default file output is restricted to runtime/tmp.",
      "Real provider calls remain dry-run until provider choice, outbound content, and cost boundary are explicitly approved."
    ],
    snapshot: {
      packageName: packageJson?.name,
      packageVersion: packageJson?.version,
      hasProjectConfig,
      hasLocalOverride,
      providers: providerNames,
      routes: routeNames,
      workflows: workflowNames,
      checks
    },
    commands: {
      firstDryRunPath: [
        "npm ci",
        "npm run onboard:print",
        "npm run ai-link -- config validate",
        "npm run providers:dry",
        "npm run providers:dry:json",
        "npm run package:check:json",
        "npm run package:install-smoke:json",
        "npm run next:actions:json",
        "npm run setup:handoff:json",
        "npm run github:safety:json",
        "npm run github:hardening:json",
        "npm run release:plan:json",
        "npm run release:decisions:json",
        "npm run release:decisions:next:json",
        "npm run release:manual-gates:json",
        "npm run release:evidence:json",
        "npm run release:readiness:json",
        "npm run workflow:dry",
        "npm run ai-link -- skill draft --skill auto_ops --description \"research with Grok, article draft with Kimi\" --write .ai-link/local.yaml --diff --json",
        "npm run ai-link -- run auto_ops.research --dry-run --input \"fresh onboarding check\"",
        "npm run security:scan"
      ],
      customizeSkillPreview: "npm run ai-link -- skill draft --skill my_skill --description \"research with Grok, article draft with Kimi, Codex handles implementation\" --write .ai-link/local.yaml --diff --json",
      customizeSkillWrite: "npm run ai-link -- skill draft --skill my_skill --description \"research with Grok, article draft with Kimi, Codex handles implementation\" --write .ai-link/local.yaml --diff --json --yes",
      realProviderKeys: [
        "npm run bws:plan",
        "npm run bws:onboard:print",
        "npm run bws:acceptance:print",
        "npm run providers:live:safe-report",
        "npm run providers:live:safe-report:strict",
        "npm run providers:github:dispatch-plan"
      ],
      closeoutChecks: [
        "npm run check",
        "npm test",
        "npm run package:check",
        "npm run package:install-smoke",
        "npm run next:actions",
        "npm run setup:handoff",
        "npm run github:safety",
        "npm run github:hardening",
        "npm run release:plan",
        "npm run release:decisions",
        "npm run release:decisions:next",
        "npm run release:manual-gates",
        "npm run release:evidence",
        "npm run release:readiness",
        "npm run security:scan",
        "npm run verify:fresh"
      ]
    }
  };
}

export function renderOnboardingMarkdown(report: OnboardingReport): string {
  const lines: string[] = [];
  lines.push("# AI Link Public User Onboarding");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push(`This runbook is safe for a public clone. ${report.safety[0]}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- OK: ${report.summary.ok ? "yes" : "no"}`);
  lines.push(`- Strict OK: ${report.summary.strictOk ? "yes" : "no"}`);
  lines.push(`- Counts: pass ${report.summary.counts.pass}, ready ${report.summary.counts.ready}, info ${report.summary.counts.info}, warn ${report.summary.counts.warn}, fail ${report.summary.counts.fail}`);
  lines.push("");
  lines.push("## Current Snapshot");
  lines.push("");
  lines.push("| Check | Status | Detail |");
  lines.push("| --- | --- | --- |");
  for (const check of report.snapshot.checks) {
    lines.push(`| ${escapeCell(check.check)} | ${escapeCell(check.status)} | ${escapeCell(check.detail)} |`);
  }
  lines.push("");
  lines.push("## First Dry-Run Path");
  lines.push("");
  lines.push("Run these commands before adding any real provider key:");
  lines.push("");
  pushCommandBlock(lines, report.commands.firstDryRunPath);
  lines.push("");
  lines.push("## Customize A Skill");
  lines.push("");
  lines.push("Preview a local skill config without writing:");
  lines.push("");
  pushCommandBlock(lines, [report.commands.customizeSkillPreview]);
  lines.push("");
  lines.push("After reviewing the JSON `diff`, write it to local-only config:");
  lines.push("");
  pushCommandBlock(lines, [report.commands.customizeSkillWrite]);
  lines.push("");
  lines.push("## Real Provider Keys");
  lines.push("");
  lines.push("Keep real API keys outside Git. The recommended path is Bitwarden Secrets Manager:");
  lines.push("");
  pushCommandBlock(lines, report.commands.realProviderKeys);
  lines.push("");
  lines.push("Do not remove `--dry-run` or dispatch provider-live verification until the provider choice, outbound content, and cost boundary are explicitly approved.");
  lines.push("");
  lines.push("## Closeout Checks");
  lines.push("");
  lines.push("For repository changes, finish with:");
  lines.push("");
  pushCommandBlock(lines, report.commands.closeoutChecks);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function addCheck(checks: OnboardingCheck[], check: string, status: OnboardingStatus, detail: string): void {
  checks.push({ check, status, detail });
}

function summarizeChecks(checks: OnboardingCheck[]): OnboardingSummary {
  const counts: Record<OnboardingStatus, number> = {
    pass: 0,
    ready: 0,
    info: 0,
    warn: 0,
    fail: 0
  };

  for (const check of checks) {
    counts[check.status] += 1;
  }

  return {
    ok: counts.fail === 0,
    strictOk: counts.fail === 0 && counts.warn === 0,
    counts
  };
}

function pushCommandBlock(lines: string[], commands: string[]): void {
  lines.push("```powershell");
  lines.push(...commands);
  lines.push("```");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function readPackageJson(cwd: string): PackageJson | undefined {
  try {
    return JSON.parse(readFileSync(resolveRepoPath(cwd, "package.json"), "utf8")) as PackageJson;
  } catch {
    return undefined;
  }
}

function readProjectConfig(cwd: string): ProjectConfig {
  try {
    const parsed = parse(readFileSync(resolveRepoPath(cwd, ".ai-link/project.yaml"), "utf8")) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }
    return parsed as ProjectConfig;
  } catch {
    return {};
  }
}

function existsRepo(cwd: string, relativePath: string): boolean {
  return existsSync(resolveRepoPath(cwd, relativePath));
}

function resolveRepoPath(cwd: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    return path.resolve(relativePath);
  }
  return path.resolve(cwd, relativePath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
