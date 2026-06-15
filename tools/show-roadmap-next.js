#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");

const phases = [
  {
    id: "v0-1-local-public-baseline",
    title: "v0.1 local public baseline",
    status: "ready",
    owner: "Maintainer or Codex",
    horizon: "now",
    goal: "Keep the public repository useful for local Codex workflows without requiring real provider credentials.",
    outcomes: [
      "Fresh clone users can run onboarding, config validation, provider dry-runs, workflow dry-runs, and package smoke checks.",
      "Natural-language skill drafts can route research to Grok, article drafting to Kimi, and agent workflow to Coze dry-run/local command.",
      "No public artifact contains API keys, tokens, login state, screenshots, provider responses, or runtime/private content."
    ],
    nextCommands: [
      "npm run onboard:print",
      "npm run providers:dry:json",
      "npm run workflow:dry",
      "npm run maintainer:pack"
    ],
    gates: [
      "npm run check",
      "npm test",
      "npm run package:check",
      "npm run package:install-smoke",
      "npm run security:scan",
      "npm run verify:fresh"
    ],
    openQuestions: [
      "Whether v0.1 stays repository-local, becomes a GitHub Release, or is published to npm remains a release-owner decision."
    ],
    secretBoundary: "No real provider key, Bitwarden token, GitHub token, or private connector state is needed."
  },
  {
    id: "v0-1-maintainer-external-gates",
    title: "v0.1 maintainer external gates",
    status: "manual",
    owner: "Repository maintainer and release owner",
    horizon: "before tag or npm publish",
    goal: "Close public-safe manual release decisions before making external release claims.",
    outcomes: [
      "GitHub main protection or a ruleset requires the Verify check.",
      "Secret scanning and push protection are enabled for the public repository and reviewed for the internal companion repository.",
      "The release decision record is updated only with public-safe evidence or explicit waivers."
    ],
    nextCommands: [
      "npm run external:preflight",
      "npm run github:hardening:next",
      "npm run release:decisions:next",
      "npm run release:manual-gates",
      "npm run release:readiness:json"
    ],
    gates: [
      "npm run external:preflight:json",
      "npm run github:safety:json",
      "npm run release:decisions:strict"
    ],
    openQuestions: [
      "Should GitHub Discussions be enabled for external users?",
      "Should the internal companion repository get an independent branch protection or ruleset?"
    ],
    secretBoundary: "Record setting names, command statuses, and public-safe evidence only; never record screenshots, tokens, QR codes, or login state."
  },
  {
    id: "v0-2-real-provider-acceptance",
    title: "v0.2 real provider acceptance",
    status: "gated",
    owner: "Secret owner and cost approver",
    horizon: "after Bitwarden setup",
    goal: "Move from dry-run provider confidence to minimal real provider verification without leaking credentials or raw private responses.",
    outcomes: [
      "Bitwarden Secrets Manager contains local-dev and CI projects with provider API keys.",
      "GitHub provider-live Environment stores only the bootstrap BW_ACCESS_TOKEN secret and Bitwarden secret-id variables.",
      "Sanitized provider-live reports show provider names, modes, statuses, and summaries only."
    ],
    nextCommands: [
      "npm run bws:next",
      "npm run bws:acceptance:json",
      "npm run bws:acceptance:strict",
      "npm run providers:github:dispatch-plan"
    ],
    gates: [
      "npm run providers:live:safe-report:strict",
      "npm run providers:github:dispatch-strict"
    ],
    openQuestions: [
      "Which provider should be used for the first paid live verification?",
      "What prompt content and maximum spend are approved for the first live check?"
    ],
    secretBoundary: "Keep API keys, BWS_ACCESS_TOKEN, raw provider responses, and private prompts out of Git, docs, issues, PRs, chat, and the knowledge mirror."
  },
  {
    id: "v0-2-skill-authoring",
    title: "v0.2 skill authoring workflow",
    status: "ready",
    owner: "Codex and public users",
    horizon: "next public capability",
    goal: "Make new Codex skills easier to compose from natural-language model, agent, policy, and workflow requirements.",
    outcomes: [
      "Users can preview route/workflow diffs before writing local-only config.",
      "Skill examples show when to use model providers, agent providers, Codex implementation, and approval gates.",
      "Run records and structured outputs give later stages enough context without storing secrets."
    ],
    nextCommands: [
      "npm run ai-link -- skill draft --skill my_skill --description \"research with Grok, article draft with Kimi, Codex handles implementation\" --write .ai-link/local.yaml --diff --json",
      "npm run ai-link -- workflow run auto_ops --dry-run --record --input \"public task\"",
      "npm run ai-link -- runs list --json"
    ],
    gates: [
      "npm run skills:check",
      "npm run workflow:dry",
      "npm run verify:fresh"
    ],
    openQuestions: [
      "Should examples/auto-ops remain lightweight or become a full example project?",
      "Which additional public skill template should be added after auto_ops?"
    ],
    secretBoundary: "Skill drafts should write only to .ai-link/local.yaml or user-private config unless the maintainer intentionally updates public project config."
  },
  {
    id: "v0-3-agent-connectors",
    title: "v0.3 agent and connector expansion",
    status: "draft",
    owner: "Product owner and connector owner",
    horizon: "after v0.1 release decision",
    goal: "Extend the platform from model routing into safer agent and platform connector workflows.",
    outcomes: [
      "Coze remains available through dry-run/local command and can later be upgraded to API or MCP after the integration path is confirmed.",
      "Auth Hub keeps real platform login state local/private while exposing public-safe task and audit contracts.",
      "Connector contracts distinguish available, reserved, and misconfigured connectors without exposing account state."
    ],
    nextCommands: [
      "npm run auth-hub:audit-smoke",
      "npm run auth-hub:deploy:check",
      "npm run ai-link -- run auto_ops.agent_flow --dry-run --input \"connector planning check\""
    ],
    gates: [
      "npm run auth-hub:test",
      "npm run security:scan"
    ],
    openQuestions: [
      "Should Coze real integration prioritize API, MCP, CLI, or another bridge?",
      "Which real connector comes first: WeChat, Zhuque AI, Douyin, Xiaohongshu, Zhihu, or Toutiao?",
      "Should Auth Hub be deployed to Render with Cloudflare Access or stay local-first for now?"
    ],
    secretBoundary: "Do not publish account credentials, cookies, QR codes, browser profiles, private screenshots, or raw connector payloads."
  },
  {
    id: "later-sdk-and-ecosystem",
    title: "Later SDK and ecosystem",
    status: "draft",
    owner: "Product owner",
    horizon: "after CLI workflows stabilize",
    goal: "Consider SDKs only after the CLI contracts, provider interfaces, skill flow, and governance gates are stable.",
    outcomes: [
      "The CLI remains the first public contract for v0.1.",
      "Provider, router, skills, and policies modules stay stable enough for future SDK extraction.",
      "Issue templates and examples collect real user feedback before broadening the surface area."
    ],
    nextCommands: [
      "npm run release:readiness:json",
      "npm run next:actions:json",
      "npm run roadmap:next:json"
    ],
    gates: [
      "No SDK work starts until v0.1 release channel and provider-live posture are clear."
    ],
    openQuestions: [
      "Which language, if any, needs the first SDK?",
      "Should SDK users depend on config files, programmatic builders, or both?"
    ],
    secretBoundary: "SDK planning must not broaden where secrets can live; keep real credentials in user-private stores or secret managers."
  }
];

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    ok: true,
    phases: phases.length,
    activeReady: phases.filter((phase) => phase.status === "ready").length,
    openDecisions: phases.reduce((count, phase) => count + phase.openQuestions.length, 0),
    counts: summarize(phases)
  },
  repository: {
    branch: gitOutput(["branch", "--show-current"]) || undefined,
    head: gitOutput(["rev-parse", "--short", "HEAD"]) || undefined,
    upstream: gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || undefined,
    clean: (gitOutput(["status", "--porcelain"]) ?? "").length === 0
  },
  safety: [
    "Does not read API keys, tokens, .env files, GitHub secrets, Bitwarden values, provider responses, login state, browser state, screenshots, or runtime/private.",
    "Does not modify GitHub settings, release records, tags, npm packages, Bitwarden secrets, GitHub secrets, provider-live workflows, or connector accounts.",
    "Use this as a planning map; use next:actions, maintainer:pack, and release:* commands for execution evidence."
  ],
  phases
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

function summarize(items) {
  const counts = {};
  for (const item of items) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  return counts;
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

function renderMarkdown(roadmap) {
  const lines = [];
  lines.push("# AI Link Roadmap Next");
  lines.push("");
  lines.push(`Generated: ${roadmap.generatedAt}`);
  lines.push("");
  lines.push("This roadmap is safe for public logs. It does not read or print secret values.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- OK: ${roadmap.summary.ok ? "yes" : "no"}`);
  lines.push(`- Phases: ${roadmap.summary.phases}`);
  lines.push(`- Ready phases: ${roadmap.summary.activeReady}`);
  lines.push(`- Open decisions: ${roadmap.summary.openDecisions}`);
  lines.push(`- Repository: ${roadmap.repository.branch ?? "unknown"} @ ${roadmap.repository.head ?? "unknown"}`);
  lines.push(`- Working tree clean: ${roadmap.repository.clean ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Phase Map");
  lines.push("");
  lines.push("| Phase | Status | Horizon | Owner |");
  lines.push("| --- | --- | --- | --- |");
  for (const phase of roadmap.phases) {
    lines.push(`| ${escapeCell(phase.title)} | ${escapeCell(phase.status)} | ${escapeCell(phase.horizon)} | ${escapeCell(phase.owner)} |`);
  }
  lines.push("");

  for (const phase of roadmap.phases) {
    lines.push(`## ${phase.title}`);
    lines.push("");
    lines.push(`Status: ${phase.status}`);
    lines.push(`Owner: ${phase.owner}`);
    lines.push(`Horizon: ${phase.horizon}`);
    lines.push("");
    lines.push(`Goal: ${phase.goal}`);
    lines.push("");
    pushList(lines, "Outcomes", phase.outcomes);
    pushList(lines, "Open questions", phase.openQuestions);
    lines.push("Next commands:");
    lines.push("");
    pushCommandBlock(lines, phase.nextCommands);
    lines.push("");
    pushList(lines, "Gates", phase.gates);
    lines.push(`Secret boundary: ${phase.secretBoundary}`);
    lines.push("");
  }

  lines.push("## Safety Boundary");
  lines.push("");
  for (const line of roadmap.safety) {
    lines.push(`- ${line}`);
  }

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
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
