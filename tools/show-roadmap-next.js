#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");

const program = {
  asOf: "2026-07-13",
  objective: "Advance Auth Hub status, platform authorization connectors P0.2, and remote deployment as one governed AI Link program.",
  recommendedNext: "Merge PR #22 first after explicit maintainer authorization, then continue the dependency order.",
  mergeOrder: ["#22", "#23", "#26", "#24", "#25", "#27", "#28"],
  modules: [
    {
      id: "auth-hub-status-center",
      number: 2,
      title: "Auth Hub 状态中枢",
      status: "merge_chain",
      currentStage: "Public status baseline is merged; executor/probe/remote hardening is implemented in the open PR stack.",
      completed: [
        "PR #12, #16, and #17 merged login summaries, public next actions, and the project-facing status client.",
        "The open stack implements executor capability heartbeat, operation-bound probe evidence, remote identity hardening, abuse controls, and data lifecycle.",
        "Local full-chain mock, redacted audit, and restricted Codex client boundaries are verified."
      ],
      pending: [
        "Merge PR #22, #23, #24, #25, #27, and #28 in dependency order.",
        "Rebase or retarget each stacked PR after its parent merges and rerun GitHub checks.",
        "Do not claim the remote status center is deployed until Cloudflare Access and Render smoke evidence exists."
      ],
      decision: {
        background: "The code chain is reviewable and CI-green, but only PR #21 has entered main; dependent status evidence remains outside main.",
        content: "Authorize each merge one at a time, beginning with PR #22.",
        recommendation: "Use merge commits and the order #22 -> #23 -> #26 -> #24 -> #25 -> #27 -> #28.",
        value: "Moves the status center into main without losing ancestry or mixing independent GitHub scope probes into later conflict resolution.",
        risk: "Merging out of order can create duplicated commits, misleading PR diffs, or unverified conflict resolutions."
      }
    },
    {
      id: "platform-auth-connectors-p0-2",
      number: 5,
      title: "平台授权连接器 P0.2",
      status: "manual_acceptance",
      currentStage: "Public contracts and private adapter scaffolds are merged; real account acceptance remains gated.",
      completed: [
        "PR #9 and #13 merged platform contracts and the interactive-login approval gate.",
        "PR #18-#21 merged GitHub and WeChat private scaffolds plus the combined Xiaohongshu read-only bridge entry.",
        "Private runtime state stays under runtime/private and public task results are rebuilt through allowlists."
      ],
      pending: [
        "Merge PR #26 for precise GitHub read-scope evidence.",
        "Run a low-risk real GitHub read-only acceptance with the existing local gh authorization.",
        "Separately approve Xiaohongshu account/keywords/time window and WeChat credentials/IP allowlist before real calls.",
        "Complete Hermes platform_auth_collect consumption acceptance after connector evidence is stable."
      ],
      decision: {
        background: "The connector framework is implemented, but scaffold success does not prove a real platform account can be used safely.",
        content: "Choose the first real acceptance path and its account, scope, frequency, and stop conditions.",
        recommendation: "Complete GitHub read-only acceptance first, then Xiaohongshu read-only, then WeChat health; keep drafts and publish as separate approvals.",
        value: "Starts with the least interactive, easiest-to-revoke path and produces reusable Auth Hub evidence before browser or AppSecret handling.",
        risk: "Real calls can consume quota, trigger platform controls, or expose account state if private boundaries are bypassed."
      }
    },
    {
      id: "auth-hub-remote",
      number: 6,
      title: "Auth Hub 远程化",
      status: "deployment_gated",
      currentStage: "Code, tests, rollback guidance, and a Chinese deployment handoff are ready in the stack; no production resource exists.",
      completed: [
        "PR #24, #25, #27, and #28 implement Access identity checks, deployment readiness, browser-write protection, credential lifecycle, and retention.",
        "Service Auth target allowlisting, no-redirect health checks, independent browser/service acceptance, and executor target protection are verified.",
        "The production preflight deliberately remains NO-GO until deployment decisions are encoded."
      ],
      pending: [
        "Merge the complete Auth Hub stack into main before creating a Render Blueprint.",
        "Approve region, custom domain, paid plans, allowed email, Service Auth, secret storage, native-domain policy, retention timing, and backup/PITR.",
        "Create Render and Cloudflare resources only after the approved render.yaml change passes CI.",
        "Run remote mock smoke and browser acceptance separately; real platform calls remain independent gates."
      ],
      decision: {
        background: "Remote deployment adds recurring cost, public DNS, production secrets, identity policy, and database recovery responsibility.",
        content: "Approve the deployment decision card after the code merge chain is complete.",
        recommendation: "Use auth.xiao-qi-ai.com, Singapore, one Starter web instance, basic-256mb Postgres, exact-email Access, one revocable Service Auth token, no initial retention cron, and verified backup/PITR before apply.",
        value: "Lets ParentingGame, Hermes, and other projects submit controlled tasks and inspect redacted status without receiving platform login state.",
        risk: "Incorrect DNS, Access, secret, or backup settings can expose the console, lock out the operator, or make retention irreversible."
      }
    }
  ]
};

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
    title: "v0.1 maintainer external gates recorded",
    status: "ready",
    owner: "Repository maintainer and release owner",
    horizon: "maintain current repository-local baseline",
    goal: "Keep the approved GitHub hardening and repository-local release decisions green without reopening them during Auth Hub work.",
    outcomes: [
      "The Protect main ruleset requires Verify and restricts deletion and non-fast-forward updates.",
      "Secret scanning and push protection are enabled for the public repository; the internal companion limitation is recorded.",
      "The release owner selected repository-local, so npm publish is not an active project decision."
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
    openQuestions: [],
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
      "A public skill authoring boundary template shows when to use model providers, agent providers, Codex implementation, and approval gates.",
      "Skill examples show how Codex calls AI Link while keeping local execution, validation, and Git closeout under Codex control.",
      "Run records and structured outputs give later stages enough context without storing secrets."
    ],
    nextCommands: [
      "npm run skills:check",
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
      "Which domain-specific public skill template should be added after the generic AI Link skill author and auto_ops examples?"
    ],
    secretBoundary: "Skill drafts should write only to .ai-link/local.yaml or user-private config unless the maintainer intentionally updates public project config."
  },
  {
    id: "v0-3-agent-connectors",
    title: "Auth Hub and platform connector program",
    status: "active",
    owner: "Product owner, connector owner, and infrastructure maintainer",
    horizon: "now: merge and manual acceptance",
    goal: "Complete modules 2, 5, and 6 without moving platform login state into the remote control plane.",
    outcomes: [
      "Auth Hub exposes task, approval, connector, executor, and audit status while failing closed on stale evidence.",
      "GitHub, WeChat, and Xiaohongshu use one governed private connector boundary with operation-specific evidence.",
      "Remote Auth Hub keeps real platform login state local/private and accepts only redacted task and audit contracts."
    ],
    nextCommands: [
      "npm run next:actions:json",
      "npm run auth-status:next:json",
      "npm run auth-hub:remote:next:json",
      "npm run auth-hub:test"
    ],
    gates: [
      "npm run auth-hub:test",
      "npm run security:scan"
    ],
    openQuestions: [
      "Will the maintainer authorize the PR merge sequence beginning with PR #22?",
      "Which approved test account, scope, frequency, and stop conditions will be used for each real connector acceptance?",
      "Will the owner approve the Auth Hub deployment decision card after the merge chain enters main?"
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
    programModules: program.modules.length,
    activeReady: phases.filter((phase) => phase.status === "ready").length,
    openDecisions: phases.reduce((count, phase) => count + phase.openQuestions.length, 0) + program.modules.length,
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
  program,
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
  lines.push(`- Active program modules: ${roadmap.summary.programModules}`);
  lines.push(`- Ready phases: ${roadmap.summary.activeReady}`);
  lines.push(`- Open decisions: ${roadmap.summary.openDecisions}`);
  lines.push(`- Repository: ${roadmap.repository.branch ?? "unknown"} @ ${roadmap.repository.head ?? "unknown"}`);
  lines.push(`- Working tree clean: ${roadmap.repository.clean ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Program Control");
  lines.push("");
  lines.push(`As of: ${roadmap.program.asOf}`);
  lines.push(`Recommended next: ${roadmap.program.recommendedNext}`);
  lines.push(`Merge order: ${roadmap.program.mergeOrder.join(" -> ")}`);
  lines.push("");
  lines.push("| Module | Status | Current stage |");
  lines.push("| --- | --- | --- |");
  for (const module of roadmap.program.modules) {
    lines.push(`| ${module.number}. ${escapeCell(module.title)} | ${escapeCell(module.status)} | ${escapeCell(module.currentStage)} |`);
  }
  lines.push("");

  for (const module of roadmap.program.modules) {
    lines.push(`### ${module.number}. ${module.title}`);
    lines.push("");
    pushList(lines, "Completed", module.completed);
    pushList(lines, "Pending", module.pending);
    lines.push(`Decision background: ${module.decision.background}`);
    lines.push(`Decision content: ${module.decision.content}`);
    lines.push(`Recommendation: ${module.decision.recommendation}`);
    lines.push(`Value: ${module.decision.value}`);
    lines.push(`Risk: ${module.decision.risk}`);
    lines.push("");
  }

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
