#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const outputPath = stringFlag(args, "output") ?? "runtime/tmp/ai-link-onboarding.md";

if (booleanFlag(args, "help")) {
  printHelp();
  process.exit(0);
}

const report = buildReport();

if (booleanFlag(args, "print")) {
  process.stdout.write(report);
  process.exit(0);
}

const targetPath = resolveRepoPath(outputPath);
if (!isRuntimeTmpTarget(targetPath)) {
  fail("Refusing to write onboarding output outside runtime/tmp.");
}

mkdirSync(path.dirname(targetPath), { recursive: true });
writeFileSync(targetPath, report, "utf8");
console.log(`AI Link onboarding written to ${outputPath}`);

function buildReport() {
  const packageJson = readJson("package.json");
  const projectConfig = readYaml(".ai-link/project.yaml");
  const providerNames = Object.keys(projectConfig.providers ?? {}).sort();
  const routeNames = Object.keys(projectConfig.routes ?? {}).sort();
  const workflowNames = Object.keys(projectConfig.workflows ?? {}).sort();
  const requiredScripts = [
    "ai-link",
    "providers:dry",
    "workflow:dry",
    "skills:check",
    "security:scan",
    "verify:fresh"
  ];

  const lines = [];
  lines.push("# AI Link Public User Onboarding");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("This runbook is safe for a public clone. It does not read API keys, tokens, .env files, login state, or provider responses.");
  lines.push("");
  lines.push("## Current Snapshot");
  lines.push("");
  lines.push("| Check | Status | Detail |");
  lines.push("| --- | --- | --- |");
  addRow(lines, "package.json", packageJson ? "pass" : "fail", packageJson ? `${packageJson.name ?? "package"} ${packageJson.version ?? ""}`.trim() : "missing");
  addRow(lines, "project config", projectConfig ? "pass" : "fail", ".ai-link/project.yaml");
  addRow(lines, "local override", existsRepo(".ai-link/local.yaml") ? "info" : "ready", existsRepo(".ai-link/local.yaml") ? ".ai-link/local.yaml exists" : "not present; safe default for a fresh clone");
  addRow(lines, "providers", providerNames.length > 0 ? "pass" : "fail", providerNames.join(", ") || "none");
  addRow(lines, "routes", routeNames.length > 0 ? "pass" : "fail", routeNames.join(", ") || "none");
  addRow(lines, "workflows", workflowNames.length > 0 ? "pass" : "fail", workflowNames.join(", ") || "none");
  addRow(lines, "auto ops Codex skill", existsRepo("examples/codex-skills/auto-ops-ai-link/SKILL.md") ? "pass" : "warn", "examples/codex-skills/auto-ops-ai-link/SKILL.md");
  addRow(lines, "BWS secret mode skill", existsRepo("examples/codex-skills/bws-secret-mode/SKILL.md") ? "pass" : "warn", "examples/codex-skills/bws-secret-mode/SKILL.md");
  for (const script of requiredScripts) {
    addRow(lines, `script ${script}`, packageJson?.scripts?.[script] ? "pass" : "warn", packageJson?.scripts?.[script] ? "available" : "missing");
  }
  lines.push("");
  lines.push("## First Dry-Run Path");
  lines.push("");
  lines.push("Run these commands before adding any real provider key:");
  lines.push("");
  lines.push("```powershell");
  lines.push("npm ci");
  lines.push("npm run onboard:print");
  lines.push("npm run ai-link -- config validate");
  lines.push("npm run providers:dry");
  lines.push("npm run workflow:dry");
  lines.push("npm run ai-link -- skill draft --skill auto_ops --description \"research with Grok, article draft with Kimi\" --write .ai-link/local.yaml --diff --json");
  lines.push("npm run ai-link -- run auto_ops.research --dry-run --input \"fresh onboarding check\"");
  lines.push("npm run security:scan");
  lines.push("```");
  lines.push("");
  lines.push("## Customize A Skill");
  lines.push("");
  lines.push("Preview a local skill config without writing:");
  lines.push("");
  lines.push("```powershell");
  lines.push("npm run ai-link -- skill draft --skill my_skill --description \"research with Grok, article draft with Kimi, Codex handles implementation\" --write .ai-link/local.yaml --diff --json");
  lines.push("```");
  lines.push("");
  lines.push("After reviewing the JSON `diff`, write it to local-only config:");
  lines.push("");
  lines.push("```powershell");
  lines.push("npm run ai-link -- skill draft --skill my_skill --description \"research with Grok, article draft with Kimi, Codex handles implementation\" --write .ai-link/local.yaml --diff --json --yes");
  lines.push("```");
  lines.push("");
  lines.push("## Real Provider Keys");
  lines.push("");
  lines.push("Keep real API keys outside Git. The recommended path is Bitwarden Secrets Manager:");
  lines.push("");
  lines.push("```powershell");
  lines.push("npm run bws:plan");
  lines.push("npm run bws:onboard:print");
  lines.push("npm run bws:acceptance:print");
  lines.push("npm run providers:github:dispatch-plan");
  lines.push("```");
  lines.push("");
  lines.push("Do not remove `--dry-run` or dispatch provider-live verification until the provider choice, outbound content, and cost boundary are explicitly approved.");
  lines.push("");
  lines.push("## Closeout Checks");
  lines.push("");
  lines.push("For repository changes, finish with:");
  lines.push("");
  lines.push("```powershell");
  lines.push("npm run check");
  lines.push("npm test");
  lines.push("npm run security:scan");
  lines.push("npm run verify:fresh");
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function addRow(lines, check, status, detail) {
  lines.push(`| ${escapeCell(check)} | ${escapeCell(status)} | ${escapeCell(detail)} |`);
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(resolveRepoPath(relativePath), "utf8"));
  } catch {
    return null;
  }
}

function readYaml(relativePath) {
  try {
    return parse(readFileSync(resolveRepoPath(relativePath), "utf8")) ?? {};
  } catch {
    return {};
  }
}

function existsRepo(relativePath) {
  return existsSync(resolveRepoPath(relativePath));
}

function resolveRepoPath(relativePath) {
  if (path.isAbsolute(relativePath)) {
    return path.resolve(relativePath);
  }
  return path.resolve(root, relativePath);
}

function isRuntimeTmpTarget(targetPath) {
  const runtimeTmp = path.resolve(root, "runtime", "tmp");
  const relative = path.relative(runtimeTmp, targetPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("-")) {
      continue;
    }
    const normalized = arg.replace(/^-+/, "");
    const [name, inlineValue] = normalized.split("=", 2);
    const next = argv[index + 1];
    const isBoolean = inlineValue === undefined && (next === undefined || next.startsWith("-"));
    if (isBoolean) {
      flags[name] = true;
      continue;
    }
    flags[name] = inlineValue ?? next;
    if (inlineValue === undefined) {
      index += 1;
    }
  }
  return flags;
}

function stringFlag(flags, name) {
  return typeof flags[name] === "string" ? flags[name] : undefined;
}

function booleanFlag(flags, name) {
  return flags[name] === true;
}

function printHelp() {
  console.log(`AI Link public user onboarding

Usage:
  node tools/new-user-onboarding.js [--print] [--output runtime/tmp/ai-link-onboarding.md]

Safety:
  - Does not read API keys, tokens, .env files, login state, or provider responses.
  - Writes only inside runtime/tmp unless --print is used.
`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
