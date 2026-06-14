#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
const outputJson = args.includes("--json");
const skipHeavy = args.includes("--skip-heavy") || process.env.AI_LINK_RELEASE_EVIDENCE_SKIP_HEAVY === "1";
const cwd = process.cwd();
const outputPath = getArgValue("--output") ?? (outputJson ? undefined : "runtime/tmp/release-evidence.json");
const steps = [];
const reports = {};

function getArgValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function repoPath(relativePath) {
  return path.resolve(cwd, relativePath);
}

function runtimeTmpPath(relativePath) {
  const resolved = repoPath(relativePath);
  const runtimeTmp = repoPath("runtime/tmp");
  const relative = path.relative(runtimeTmp, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Refusing to write release evidence outside runtime/tmp.");
  }
  return resolved;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env
    }
  });

  return {
    command: [command, ...commandArgs].join(" "),
    status: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message
  };
}

function addStep(step) {
  steps.push(step);
}

function cleanText(value) {
  return String(value ?? "").trim().replace(/\r?\n/g, " ").slice(0, 500);
}

function summarizeReport(report) {
  if (!report?.summary) {
    return "summary unavailable";
  }
  const summary = report.summary;
  const counts = summary.counts ? ` counts ${JSON.stringify(summary.counts)}` : "";
  const manual = summary.manualOpen === undefined ? "" : ` manualOpen ${summary.manualOpen}`;
  return `ok ${Boolean(summary.ok)} strictOk ${summary.strictOk ?? "n/a"}${manual}${counts}`;
}

function runTextStep(id, title, commandArgs, options = {}) {
  if (options.heavy && skipHeavy) {
    addStep({
      id,
      title,
      status: "skipped",
      detail: "Skipped by --skip-heavy or AI_LINK_RELEASE_EVIDENCE_SKIP_HEAVY=1.",
      command: commandArgs.join(" ")
    });
    return true;
  }

  const result = run(commandArgs[0], commandArgs.slice(1), options);
  const ok = result.status === 0;
  addStep({
    id,
    title,
    status: ok ? "pass" : "fail",
    detail: ok ? cleanText(result.stdout) : cleanText(result.error ?? result.stderr ?? result.stdout),
    command: result.command
  });
  return ok;
}

function runJsonStep(id, title, commandArgs, options = {}) {
  if (options.heavy && skipHeavy) {
    addStep({
      id,
      title,
      status: "skipped",
      detail: "Skipped by --skip-heavy or AI_LINK_RELEASE_EVIDENCE_SKIP_HEAVY=1.",
      command: commandArgs.join(" ")
    });
    return undefined;
  }

  const result = run(commandArgs[0], commandArgs.slice(1), options);
  if (result.status !== 0) {
    addStep({
      id,
      title,
      status: "fail",
      detail: cleanText(result.error ?? result.stderr ?? result.stdout),
      command: result.command
    });
    return undefined;
  }

  try {
    const parsed = JSON.parse(result.stdout);
    reports[id] = parsed;
    const hasWarn = parsed.summary?.counts?.warn > 0;
    addStep({
      id,
      title,
      status: hasWarn ? "warn" : "pass",
      detail: summarizeReport(parsed),
      command: result.command
    });
    return parsed;
  } catch (error) {
    addStep({
      id,
      title,
      status: "fail",
      detail: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
      command: result.command
    });
    return undefined;
  }
}

try {
  runTextStep("build", "Runtime build", [process.execPath, "tools/build-runtime.js"], { heavy: true });
  runJsonStep("onboarding", "Public onboarding", [process.execPath, "--import", "tsx", "src/cli.ts", "onboard", "--json", "--strict"]);
  runJsonStep("nextActions", "Next actions", [process.execPath, "tools/show-next-actions.js", "--json"]);
  runJsonStep("setupHandoff", "Setup handoff", [process.execPath, "tools/show-setup-handoff.js", "--json"]);
  runJsonStep("packageContents", "Package contents", [process.execPath, "tools/check-package-contents.js", "--json"], { heavy: true });
  runJsonStep("packageInstallSmoke", "Package install smoke", [process.execPath, "tools/check-package-install.js", "--json"], { heavy: true });
  runJsonStep("githubSafety", "GitHub repository safety", [process.execPath, "tools/check-github-repo-safety.js", "--json"]);
  runJsonStep("githubHardening", "GitHub hardening worksheet", [process.execPath, "tools/new-github-hardening-worksheet.js", "--json"]);
  runJsonStep("releasePlan", "Release plan", [process.execPath, "tools/check-release-plan.js", "--json"]);
  runJsonStep("releaseDecisions", "Release decisions", [process.execPath, "tools/check-release-decisions.js", "--json"]);
  runJsonStep("releaseDecisionUpdatePreview", "Release decision update preview", [process.execPath, "tools/update-release-decision.js", "--json", "--id", "npm-publish-decision", "--status", "approved", "--selected-channel", "repository-local", "--evidence", "Release owner selected repository-local after package smoke checks."]);
  runJsonStep("releaseManualGates", "Release manual gates", [process.execPath, "tools/show-release-manual-gates.js", "--json"]);
  runJsonStep("releaseReadiness", "Release readiness", [process.execPath, "tools/check-release-readiness.js", "--json"]);
  runTextStep("securityScan", "Security scan", [process.execPath, "tools/security-scan.js"], { heavy: true });
} catch (error) {
  addStep({
    id: "releaseEvidence",
    title: "Release evidence",
    status: "fail",
    detail: error instanceof Error ? error.message : String(error),
    command: "tools/new-release-evidence.js"
  });
}

const counts = { pass: 0, warn: 0, fail: 0, skipped: 0 };
for (const step of steps) {
  counts[step.status] += 1;
}

const manualOpen = Math.max(
  Number(reports.releaseManualGates?.summary?.manualOpen ?? 0),
  Number(reports.setupHandoff?.summary?.manualOpen ?? 0),
  Number(reports.releaseDecisions?.summary?.manualOpen ?? 0),
  Number(reports.releaseReadiness?.summary?.manualOpen ?? 0),
  Number(reports.releasePlan?.summary?.manualOpen ?? 0)
);

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    ok: counts.fail === 0,
    strictOk: counts.fail === 0 && counts.warn === 0,
    manualOpen,
    counts
  },
  safety: [
    "Does not read API keys, tokens, .env files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, or runtime/private.",
    "Does not modify GitHub settings, create tags, publish npm packages, or dispatch live providers.",
    "Default file output is restricted to runtime/tmp."
  ],
  output: {
    path: outputPath
  },
  steps,
  reports
};

if (outputPath) {
  try {
    const target = runtimeTmpPath(outputPath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  } catch (error) {
    report.steps.push({
      id: "releaseEvidenceOutput",
      title: "Release evidence output",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
      command: `--output ${outputPath}`
    });
    report.summary.counts.fail += 1;
    report.summary.ok = false;
    report.summary.strictOk = false;
  }
}

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

if (!report.summary.ok) {
  process.exitCode = 2;
}

function renderMarkdown(evidenceReport) {
  const lines = [];
  lines.push("# AI Link Release Evidence");
  lines.push("");
  lines.push(`Generated: ${evidenceReport.generatedAt}`);
  lines.push("");
  lines.push("This report is safe for public logs. It does not read or print secret values.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- OK: ${evidenceReport.summary.ok ? "yes" : "no"}`);
  lines.push(`- Strict OK: ${evidenceReport.summary.strictOk ? "yes" : "no"}`);
  lines.push(`- Manual open: ${evidenceReport.summary.manualOpen}`);
  lines.push(`- Counts: pass ${evidenceReport.summary.counts.pass}, warn ${evidenceReport.summary.counts.warn}, fail ${evidenceReport.summary.counts.fail}, skipped ${evidenceReport.summary.counts.skipped}`);
  if (evidenceReport.output.path) {
    lines.push(`- JSON: ${evidenceReport.output.path}`);
  }
  lines.push("");
  lines.push("## Steps");
  lines.push("");
  lines.push("| Step | Status | Detail |");
  lines.push("| --- | --- | --- |");
  for (const step of evidenceReport.steps) {
    lines.push(`| ${escapeCell(step.title)} | ${escapeCell(step.status)} | ${escapeCell(step.detail)} |`);
  }
  lines.push("");
  lines.push("## Manual Gates");
  lines.push("");
  lines.push("Run `npm run setup:handoff` and `npm run release:manual-gates` for the ordered owner/action/evidence checklist before creating a tag, publishing npm, or dispatching live providers.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
