#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");

const program = {
  asOf: "2026-07-14",
  objective: "Advance Auth Hub status, platform authorization connectors P0.2, and remote deployment as one governed AI Link program.",
  recommendedNext: "After PR #38 passes required checks and is integrated, run local/mock project-consumption acceptance before any separately approved real GitHub read-only acceptance or remote deployment.",
  mergeStatus: "complete",
  mergeOrder: ["#22", "#23", "#26", "#24", "#25", "#27", "#28", "#29", "#30"],
  modules: [
    {
      id: "auth-hub-status-center",
      number: 2,
      title: "Auth Hub 状态中枢",
      status: "project_client_pending_merge",
      currentStage: "The status-center stack is in main; PR #38 adds governed project submission, own-task status reads, and bounded polling, while notification activation and remote evidence remain gated.",
      completed: [
        "PR #12, #16, and #17 merged login summaries, public next actions, and the project-facing status client.",
        "PR #22-#25 and #27-#30 are merged with executor heartbeat, operation-bound probe evidence, remote identity hardening, abuse controls, data lifecycle, program control, and low-noise change detection.",
        "Local full-chain mock, redacted audit, and restricted Codex client boundaries are verified.",
        "The local public-safe status snapshot emits notify=true only for new or worsened attention signals without querying AI Link during ordinary project work.",
        "PR #31 records maintainer authorization for future in-scope PR merges without bypassing required checks.",
        "PR #33-#37 tightened operator trust, exact operation status, and exact GitHub target evidence.",
        "PR #38 implements project identities, persistent idempotency, own-task reads, and a packaged bounded task client; required checks are pending."
      ],
      pending: [
        "Complete required checks and integration for PR #38, then validate one dependent project through local/mock submission and status reads.",
        "Choose one approved low-frequency notification channel and schedule only after a stable local or remote Auth Hub endpoint exists.",
        "Collect the first operation-bound real connector evidence without moving credentials or login state into the public repository.",
        "Do not claim the remote status center is deployed until Cloudflare Access and Render smoke evidence exists."
      ],
      decision: {
        background: "The status stack is merged and locally verified, but no notification channel is active and the remote Auth Hub does not exist.",
        content: "Choose whether to activate the low-noise watcher, its channel, recipient, frequency, and stop conditions.",
        recommendation: "Keep the watcher repository-local and at most daily until the remote Auth Hub is accepted; notify only when notify=true.",
        value: "Surfaces new or worsening authorization work without making every project task query AI Link.",
        risk: "A noisy schedule or unstable endpoint can create false urgency; a remote channel before Access acceptance can expose operational metadata."
      }
    },
    {
      id: "platform-auth-connectors-p0-2",
      number: 5,
      title: "平台授权连接器 P0.2",
      status: "manual_acceptance",
      currentStage: "Public contracts and private adapter scaffolds are merged; PR #38 exposes only approved read-only operations through project policies, while real account acceptance remains gated.",
      completed: [
        "PR #9 and #13 merged platform contracts and the interactive-login approval gate.",
        "PR #18-#21 merged GitHub and WeChat private scaffolds plus the combined Xiaohongshu read-only bridge entry.",
        "PR #26 merged target-required, scope-specific GitHub read-only evidence checks.",
        "PR #33-#37 hardened exact operation and GitHub repository/scope evidence boundaries.",
        "PR #38 binds project policies to approved connector operations and exact GitHub targets without exposing login state.",
        "Private runtime state stays under runtime/private and public task results are rebuilt through allowlists."
      ],
      pending: [
        "Complete PR #38 integration and local/mock project-client consumption before any real connector call.",
        "Run a separately approved low-risk real GitHub read-only acceptance with the existing local authorization.",
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
      currentStage: "Code, tests, rollback guidance, and a Chinese deployment handoff are merged; PR #38 adds a remote-ready project client, but no production resource or remote smoke evidence exists.",
      completed: [
        "PR #24, #25, #27, and #28 implement Access identity checks, deployment readiness, browser-write protection, credential lifecycle, and retention.",
        "Service Auth target allowlisting, no-redirect health checks, independent browser/service acceptance, and executor target protection are verified.",
        "PR #38 packages an HTTPS-443-only, no-redirect, response-bounded project client with optional Cloudflare Service Auth.",
        "The production preflight deliberately remains NO-GO until deployment decisions are encoded."
      ],
      pending: [
        "Complete PR #38 integration and verify the packaged client against a local/mock endpoint before remote deployment work.",
        "Approve region, custom domain, paid plans, allowed email, Service Auth, secret storage, native-domain policy, retention timing, and backup/PITR.",
        "Create Render and Cloudflare resources only after the approved render.yaml change passes CI.",
        "Run remote mock smoke and browser acceptance separately; real platform calls remain independent gates."
      ],
      decision: {
        background: "Remote deployment adds recurring cost, public DNS, production secrets, identity policy, and database recovery responsibility.",
        content: "Approve the deployment decision card before creating any Render, Cloudflare, DNS, database, or secret resources.",
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
    horizon: "now: manual acceptance and deployment decision",
    goal: "Complete modules 2, 5, and 6 without moving platform login state into the remote control plane.",
    outcomes: [
      "Auth Hub exposes task, approval, connector, executor, and audit status while failing closed on stale evidence.",
      "GitHub, WeChat, and Xiaohongshu use one governed private connector boundary with operation-specific evidence.",
      "Remote Auth Hub keeps real platform login state local/private and accepts only redacted task and audit contracts."
    ],
    nextCommands: [
      "npm run next:actions:json",
      "npm run auth-hub:status:json",
      "npm run auth-hub:remote:next:json",
      "npm run auth-hub:test"
    ],
    gates: [
      "npm run auth-hub:test",
      "npm run security:scan"
    ],
    openQuestions: [
      "Which approved test account, scope, frequency, and stop conditions will be used for each real connector acceptance?",
      "Which low-frequency notification channel, if any, should receive notify=true status changes?",
      "Will the owner approve the Auth Hub deployment decision card now that the merge chain is complete?"
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
  lines.push(`Merge chain status: ${roadmap.program.mergeStatus}`);
  lines.push(`Historical merge order: ${roadmap.program.mergeOrder.join(" -> ")}`);
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
