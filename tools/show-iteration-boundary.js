#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");

const boundaryPath = "docs/00-governance/iteration-boundaries.md";
const agentsPath = "AGENTS.md";

const boundaryText = readText(boundaryPath);
const agentsText = readText(agentsPath);
const repository = {
  branch: gitOutput(["branch", "--show-current"]) || undefined,
  head: gitOutput(["rev-parse", "--short", "HEAD"]) || undefined,
  upstream: gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || undefined,
  clean: (gitOutput(["status", "--porcelain"]) ?? "").length === 0
};

const checks = [
  fileCheck("iteration boundary governance doc", boundaryPath),
  fileCheck("project agent instructions", agentsPath),
  phraseCheck("requirement section", boundaryText, "### 需求"),
  phraseCheck("expected work section", boundaryText, "### 预期开发工作"),
  phraseCheck("verification section", boundaryText, "### 验证"),
  phraseCheck("boundary control section", boundaryText, "### 边界控制"),
  phraseCheck("divergence handling", boundaryText, "预期偏差处理"),
  phraseCheck("anti-bloat and token control", boundaryText, "防过度开发和 token 控制"),
  phraseCheck("AGENTS default boundary rule", agentsText, "迭代边界默认执行")
];

const sections = [
  {
    id: "requirement",
    title: "需求",
    purpose: "Confirm why this iteration exists and what observable result proves it is correct.",
    fields: [
      "用户目标",
      "成功标准",
      "输入材料",
      "输出形态",
      "非目标",
      "用户确认点"
    ],
    redFlags: [
      "The goal cannot be stated in one sentence.",
      "The non-goals are unclear.",
      "The work depends on a release, paid call, account permission, or product decision that the user has not confirmed."
    ]
  },
  {
    id: "expected-work",
    title: "预期开发工作",
    purpose: "Define the smallest expected change set before implementation starts.",
    fields: [
      "预期产物",
      "允许改动",
      "明确不碰",
      "实现路径",
      "工作规模",
      "新增门槛"
    ],
    redFlags: [
      "A small request starts to require multiple new scripts, services, dependencies, or abstractions.",
      "The change crosses more than three subsystems.",
      "The implementation adds platform capacity for a future possibility rather than this iteration's requirement."
    ]
  },
  {
    id: "verification",
    title: "验证",
    purpose: "Prove the user goal, regression surface, safety boundary, and handoff state.",
    fields: [
      "功能验证",
      "回归验证",
      "安全验证",
      "状态验证",
      "人工验收"
    ],
    redFlags: [
      "The available checks do not prove the user-facing requirement.",
      "Only unrelated green checks are available.",
      "Evidence would require secrets, raw provider responses, private screenshots, or account state."
    ]
  },
  {
    id: "boundary-control",
    title: "边界控制",
    purpose: "Decide when to continue, stop, split the work, or ask for confirmation.",
    fields: [
      "范围边界",
      "成本边界",
      "安全边界",
      "权限边界",
      "停止条件",
      "偏差处理"
    ],
    redFlags: [
      "Token, time, or tool use is growing faster than the value of the current goal.",
      "The work touches real credentials, paid providers, publishing, or external platform accounts.",
      "Code is being used to hide unclear requirements."
    ]
  }
];

const verificationProfiles = [
  {
    id: "narrow",
    title: "Narrow local change",
    useWhen: "Single-module code, focused docs, or a small report update.",
    commands: [
      "run the targeted test or report",
      "git diff --check",
      "git status --short"
    ],
    acceptance: [
      "The diff only touches the expected files.",
      "The targeted behavior is proven.",
      "No secret or runtime/private content appears in the diff."
    ]
  },
  {
    id: "public-behavior",
    title: "Public behavior change",
    useWhen: "CLI output, user docs, package content, public config, or governance behavior changes.",
    commands: [
      "npm run check",
      "node --test tests/<focused>.test.js",
      "npm run security:scan"
    ],
    acceptance: [
      "The user-facing command or document is updated.",
      "The relevant test covers the new public behavior.",
      "Security scan passes."
    ]
  },
  {
    id: "external-or-release",
    title: "External or release-adjacent change",
    useWhen: "GitHub UI, Bitwarden, provider-live, package release, tag, deploy, or real account workflows are involved.",
    commands: [
      "npm test",
      "npm run external:preflight:json",
      "npm run release:readiness:json"
    ],
    acceptance: [
      "The repository is clean and synced before external action.",
      "Manual gates are identified and not bypassed.",
      "No real external action happens without explicit user confirmation."
    ]
  }
];

const controls = {
  stopConditions: [
    "The user goal, success standard, or non-goal is unclear.",
    "The implementation starts touching unplanned modules, external services, release flow, or private data.",
    "Two consecutive attempts fail for reasons broader than a local bug.",
    "The work would require credentials, login, paid calls, publishing, or account permissions.",
    "Token, time, or tool use is no longer proportional to this iteration's value."
  ],
  requiresConfirmation: [
    "Git tag, GitHub Release, npm publish, deploy, or public release claim.",
    "GitHub branch protection, secret scanning, push protection, or other UI setting changes.",
    "Bitwarden project, machine account, token, GitHub Environment Secret, or real provider key setup.",
    "Provider-live dispatch, paid model calls, real platform connector actions, or content publication.",
    "Broadening the iteration beyond the agreed requirement."
  ],
  antiBloatRules: [
    "One iteration pursues one main deliverable.",
    "Do not add SDKs, connectors, abstractions, dependencies, or workflows just because they may be useful later.",
    "Prefer existing patterns, docs, checks, and small verifiable increments before platform work.",
    "Record future ideas as candidates instead of implementing them in the current iteration.",
    "If a change cannot state its user value in one sentence, redefine the goal first."
  ]
};

const failingChecks = checks.filter((check) => check.status === "fail");
const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    ok: failingChecks.length === 0,
    failCount: failingChecks.length,
    sections: sections.length,
    verificationProfiles: verificationProfiles.length,
    repositoryClean: repository.clean
  },
  repository,
  safety: [
    "Does not read API keys, tokens, .env files, Bitwarden values, GitHub secrets, provider responses, login state, screenshots, or runtime/private.",
    "Does not modify GitHub, Bitwarden, release records, tags, npm packages, provider-live workflows, or external accounts.",
    "Use this before target-mode implementation to keep requirements, expected work, verification, and boundary control explicit."
  ],
  checks,
  recommendedNext: buildRecommendedNext(failingChecks),
  template: {
    sections,
    markdown: [
      "## 需求",
      "用户目标：",
      "成功标准：",
      "输入材料：",
      "输出形态：",
      "非目标：",
      "用户确认点：",
      "",
      "## 预期开发工作",
      "预期产物：",
      "允许改动：",
      "明确不碰：",
      "实现路径：",
      "工作规模：",
      "新增门槛：",
      "",
      "## 验证",
      "功能验证：",
      "回归验证：",
      "安全验证：",
      "状态验证：",
      "人工验收：",
      "",
      "## 边界控制",
      "范围边界：",
      "成本边界：",
      "安全边界：",
      "权限边界：",
      "停止条件：",
      "偏差处理："
    ].join("\n")
  },
  verificationProfiles,
  controls
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

if (!report.summary.ok) {
  process.exitCode = 2;
}

function buildRecommendedNext(failures) {
  if (failures.length > 0) {
    return {
      id: "restore-iteration-boundary-governance",
      title: "Restore iteration boundary governance",
      status: "fail",
      command: "npm run iteration:boundary",
      why: "The required project governance files or sections are missing, so target-mode work lacks an authoritative boundary contract."
    };
  }

  if (!repository.clean) {
    return {
      id: "review-current-diff-against-boundary",
      title: "Review current diff against the boundary card",
      status: "manual",
      command: "git diff --stat",
      why: "The working tree is not clean. Before starting new work, confirm the existing diff still matches the current iteration boundary."
    };
  }

  return {
    id: "write-boundary-card-before-implementation",
    title: "Write or confirm the boundary card before implementation",
    status: "ready",
    command: "npm run iteration:boundary",
    why: "The governance baseline is available and the repository is clean. Use the template before substantial target-mode implementation."
  };
}

function fileCheck(name, relativePath) {
  return {
    name,
    status: existsSync(relativePath) ? "pass" : "fail",
    detail: relativePath
  };
}

function phraseCheck(name, text, phrase) {
  return {
    name,
    status: text.includes(phrase) ? "pass" : "fail",
    detail: phrase
  };
}

function readText(relativePath) {
  try {
    return readFileSync(relativePath, "utf8");
  } catch {
    return "";
  }
}

function gitOutput(commandArgs) {
  const result = spawnSync("git", commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  if (result.error || result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

function renderMarkdown(boundaryReport) {
  const lines = [];
  lines.push("# AI Link Iteration Boundary");
  lines.push("");
  lines.push(`Generated: ${boundaryReport.generatedAt}`);
  lines.push("");
  lines.push("This report is safe for public logs. It does not read or print secret values.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- OK: ${boundaryReport.summary.ok ? "yes" : "no"}`);
  lines.push(`- Failing governance checks: ${boundaryReport.summary.failCount}`);
  lines.push(`- Repository: ${boundaryReport.repository.branch ?? "unknown"} @ ${boundaryReport.repository.head ?? "unknown"}`);
  lines.push(`- Working tree clean: ${boundaryReport.repository.clean ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Recommended Next");
  lines.push("");
  lines.push(`Action: ${boundaryReport.recommendedNext.title}`);
  lines.push("");
  lines.push(`Status: ${boundaryReport.recommendedNext.status}`);
  lines.push("");
  lines.push(`Why: ${boundaryReport.recommendedNext.why}`);
  lines.push("");
  lines.push("Command:");
  lines.push("");
  lines.push("```powershell");
  lines.push(boundaryReport.recommendedNext.command);
  lines.push("```");
  lines.push("");
  lines.push("## Governance Checks");
  lines.push("");
  lines.push("| Check | Status | Detail |");
  lines.push("| --- | --- | --- |");
  for (const check of boundaryReport.checks) {
    lines.push(`| ${escapeCell(check.name)} | ${escapeCell(check.status)} | ${escapeCell(check.detail)} |`);
  }
  lines.push("");
  lines.push("## Boundary Card Template");
  lines.push("");
  lines.push("```md");
  lines.push(boundaryReport.template.markdown);
  lines.push("```");
  lines.push("");
  lines.push("## Verification Profiles");
  lines.push("");
  for (const profile of boundaryReport.verificationProfiles) {
    lines.push(`### ${profile.title}`);
    lines.push("");
    lines.push(`Use when: ${profile.useWhen}`);
    lines.push("");
    pushList(lines, "Commands", profile.commands);
    pushList(lines, "Acceptance", profile.acceptance);
  }
  lines.push("## Stop Conditions");
  lines.push("");
  pushList(lines, "Stop when", boundaryReport.controls.stopConditions);
  pushList(lines, "Requires confirmation", boundaryReport.controls.requiresConfirmation);
  pushList(lines, "Anti-bloat rules", boundaryReport.controls.antiBloatRules);
  lines.push("## Safety");
  lines.push("");
  pushList(lines, "Boundary", boundaryReport.safety);
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

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}
