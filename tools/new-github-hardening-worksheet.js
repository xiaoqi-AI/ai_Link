#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
const outputJson = args.includes("--json");
const cwd = process.cwd();
const owner = "xiaoqi-AI";
const repo = "ai_Link";
const internalRepo = "ai_Link-internal";
const branch = "main";
const requiredStatusCheck = "Verify";
const outputPath = getArgValue("--output") ?? (outputJson ? undefined : "runtime/tmp/github-hardening-worksheet.md");

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
    throw new Error("Refusing to write GitHub hardening worksheet outside runtime/tmp.");
  }
  return resolved;
}

function gitOutput(commandArgs) {
  const result = spawnSync("git", commandArgs, {
    cwd,
    encoding: "utf8"
  });
  if (result.error || result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

const repository = {
  owner,
  name: repo,
  fullName: `${owner}/${repo}`,
  internalFullName: `${owner}/${internalRepo}`,
  branch,
  requiredStatusCheck,
  head: gitOutput(["rev-parse", "--short", "HEAD"]) || undefined,
  upstream: gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || undefined,
  clean: (gitOutput(["status", "--porcelain"]) ?? "").length === 0
};

const links = {
  publicRulesets: `https://github.com/${repository.fullName}/settings/rules`,
  publicBranches: `https://github.com/${repository.fullName}/settings/branches`,
  publicSecurity: `https://github.com/${repository.fullName}/settings/security_analysis`,
  publicActions: `https://github.com/${repository.fullName}/actions`,
  internalSecurity: `https://github.com/${repository.internalFullName}/settings/security_analysis`
};

const steps = [
  {
    id: "public-main-ruleset",
    title: "Protect public main branch",
    status: "manual",
    owner: "Repository maintainer",
    target: repository.fullName,
    ui: "Settings > Rules > Rulesets, or Settings > Branches > Branch protection rules",
    actions: [
      "Target branch pattern: main.",
      "Require a pull request before merging when external contributions begin.",
      "Require status checks to pass before merging.",
      `Require the ${requiredStatusCheck} status check.`,
      "Require branches to be up to date before merging when the team wants serialized release gates.",
      "Restrict force pushes.",
      "Restrict branch deletions."
    ],
    evidence: [
      "GitHub UI shows a ruleset or branch protection rule targeting main.",
      `The ${requiredStatusCheck} check is listed as required.`,
      "Force pushes and deletions are disabled.",
      "npm run github:safety:json reports branch protection and required status check status."
    ]
  },
  {
    id: "public-secret-scanning",
    title: "Enable public repository secret scanning",
    status: "manual",
    owner: "Repository maintainer",
    target: repository.fullName,
    ui: "Settings > Code security and analysis",
    actions: [
      "Enable secret scanning.",
      "Enable push protection.",
      "Keep local npm run security:scan in the release gate.",
      "Do not create test commits, issues, PRs, or screenshots containing fake or real secrets."
    ],
    evidence: [
      "GitHub UI shows secret scanning enabled.",
      "GitHub UI shows push protection enabled.",
      "npm run github:safety:json reports secret scanning and push protection when authenticated gh or GH_TOKEN/GITHUB_TOKEN can read metadata.",
      "npm run security:scan passes locally."
    ]
  },
  {
    id: "internal-secret-scanning",
    title: "Repeat secret scanning for internal companion repository",
    status: "manual",
    owner: "Repository maintainer",
    target: repository.internalFullName,
    ui: "Settings > Code security and analysis",
    actions: [
      "Enable secret scanning for the internal companion repository.",
      "Enable push protection for the internal companion repository.",
      "Keep internal operational material out of the public repository unless it is deliberately redacted."
    ],
    evidence: [
      "GitHub UI shows secret scanning enabled for the internal companion repository.",
      "GitHub UI shows push protection enabled for the internal companion repository.",
      "No internal-only value is copied into public docs, issues, PRs, release notes, or screenshots."
    ]
  },
  {
    id: "post-configuration-verification",
    title: "Verify after GitHub UI changes",
    status: "manual",
    owner: "Repository maintainer or Codex in an authenticated environment",
    target: repository.fullName,
    ui: "Local terminal after GitHub UI changes",
    actions: [
      "Run npm run github:safety:json with authenticated gh, GH_TOKEN, or GITHUB_TOKEN when available.",
      "Run npm run release:readiness:json.",
      "Confirm the latest main push has a green CI / Verify run.",
      "Keep provider-live and npm publish gates manual until their owners explicitly approve them."
    ],
    evidence: [
      "github:safety reports no fail items.",
      "release:readiness reports no fail items.",
      "Manual items that remain open are explicitly accepted as release gates.",
      "No secret values appear in command output, Git history, docs, issues, PRs, or chat."
    ]
  }
];

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    ok: true,
    manualOpen: steps.length,
    counts: {
      manual: steps.length
    }
  },
  safety: [
    "Does not read API keys, tokens, .env files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, or runtime/private.",
    "Does not modify GitHub settings, create tags, publish npm packages, or dispatch live providers.",
    "Default file output is restricted to runtime/tmp."
  ],
  repository,
  links,
  verificationCommands: [
    "npm run github:hardening",
    "npm run github:hardening:json",
    "npm run github:safety:json",
    "npm run release:readiness:json",
    "npm run security:scan"
  ],
  steps,
  output: {
    path: outputPath
  }
};

if (outputPath) {
  try {
    const target = runtimeTmpPath(outputPath);
    mkdirSync(path.dirname(target), { recursive: true });
    const content = outputJson ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report);
    writeFileSync(target, content, "utf8");
  } catch (error) {
    report.summary.ok = false;
    report.summary.counts.fail = 1;
    report.output.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 2;
  }
}

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

function renderMarkdown(hardeningReport) {
  const lines = [];
  lines.push("# AI Link GitHub Hardening Worksheet");
  lines.push("");
  lines.push(`Generated: ${hardeningReport.generatedAt}`);
  lines.push("");
  lines.push("This worksheet is safe for public logs. It does not read or print secret values.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- OK: ${hardeningReport.summary.ok ? "yes" : "no"}`);
  lines.push(`- Manual open: ${hardeningReport.summary.manualOpen}`);
  lines.push(`- Repository: ${hardeningReport.repository.fullName}`);
  lines.push(`- Branch: ${hardeningReport.repository.branch}`);
  lines.push(`- Required status check: ${hardeningReport.repository.requiredStatusCheck}`);
  lines.push(`- Working tree clean: ${hardeningReport.repository.clean ? "yes" : "no"}`);
  if (hardeningReport.output.path) {
    lines.push(`- Local worksheet: ${hardeningReport.output.path}`);
  }
  lines.push("");
  lines.push("## GitHub Links");
  lines.push("");
  lines.push(`- Public rulesets: ${hardeningReport.links.publicRulesets}`);
  lines.push(`- Public branch protection: ${hardeningReport.links.publicBranches}`);
  lines.push(`- Public code security: ${hardeningReport.links.publicSecurity}`);
  lines.push(`- Public Actions: ${hardeningReport.links.publicActions}`);
  lines.push(`- Internal code security: ${hardeningReport.links.internalSecurity}`);
  lines.push("");
  lines.push("## Manual Steps");
  lines.push("");
  lines.push("| Step | Owner | Target | Status |");
  lines.push("| --- | --- | --- | --- |");
  for (const step of hardeningReport.steps) {
    lines.push(`| ${escapeCell(step.title)} | ${escapeCell(step.owner)} | ${escapeCell(step.target)} | ${escapeCell(step.status)} |`);
  }
  lines.push("");

  for (const step of hardeningReport.steps) {
    lines.push(`## ${step.title}`);
    lines.push("");
    lines.push(`Owner: ${step.owner}`);
    lines.push("");
    lines.push(`Target: ${step.target}`);
    lines.push("");
    lines.push(`Where: ${step.ui}`);
    lines.push("");
    pushList(lines, "Actions", step.actions);
    pushList(lines, "Evidence", step.evidence);
  }

  lines.push("## Verification Commands");
  lines.push("");
  pushCommandBlock(lines, hardeningReport.verificationCommands);
  lines.push("");
  lines.push("## Safety Boundary");
  lines.push("");
  pushList(lines, "Rules", hardeningReport.safety);
  return `${lines.join("\n")}\n`;
}

function pushList(lines, title, items) {
  lines.push(`${title}:`);
  lines.push("");
  for (const item of items) {
    lines.push(`- ${item}`);
  }
  lines.push("");
}

function pushCommandBlock(lines, commands) {
  lines.push("```powershell");
  lines.push(...commands);
  lines.push("```");
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
