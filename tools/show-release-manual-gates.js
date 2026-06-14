#!/usr/bin/env node

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");

const gates = [
  {
    id: "github-branch-protection",
    title: "GitHub branch protection",
    status: "manual",
    owner: "Repository maintainer",
    why: "The public main branch should require the Verify check before release tags or public package decisions.",
    actions: [
      "Configure branch protection or a repository ruleset for main.",
      "Require a pull request before merging when the project starts accepting external changes.",
      "Require status checks to pass before merging.",
      "Require the Verify status check.",
      "Restrict force pushes and branch deletions."
    ],
    evidence: [
      "GitHub UI shows main protection or ruleset is active.",
      "npm run github:safety:json reports GitHub branch protection as pass.",
      "npm run github:safety:json reports required status check Verify as pass."
    ],
    commands: [
      "npm run github:safety",
      "npm run github:safety:json",
      "npm run release:readiness:json"
    ],
    safety: "No secret values are needed. Remote verification uses authenticated gh only when available."
  },
  {
    id: "github-secret-scanning",
    title: "GitHub secret scanning and push protection",
    status: "manual",
    owner: "Repository maintainer",
    why: "The repository is public, and the internal companion repository can also carry sensitive operational context.",
    actions: [
      "Enable secret scanning for xiaoqi-AI/ai_Link.",
      "Enable push protection for xiaoqi-AI/ai_Link.",
      "Repeat the same check for xiaoqi-AI/ai_Link-internal.",
      "Keep local scanning in the release gate."
    ],
    evidence: [
      "GitHub UI shows secret scanning enabled for the public repository.",
      "GitHub UI shows push protection enabled for the public repository.",
      "npm run github:safety:json reports GitHub secret scanning and push protection as pass when remote metadata is available.",
      "npm run security:scan passes locally."
    ],
    commands: [
      "npm run security:scan",
      "npm run github:safety:json",
      "npm run release:readiness:json"
    ],
    safety: "Do not paste sample secrets into issues, PRs, docs, or screenshots to test scanning."
  },
  {
    id: "npm-publish-decision",
    title: "npm publish decision",
    status: "manual",
    owner: "Release owner",
    why: "v0.1 can remain repository-local, or it can be published as @xiaoqi-ai/ai-link after ownership and rollback rules are clear.",
    actions: [
      "Choose repository-local usage or public npm publish for v0.1.",
      "If publishing, confirm npm account, package owner, package name, version, license, README, and rollback policy.",
      "Run npm publish dry-run before any real publish.",
      "Create the v0.1.0 GitHub Release only after manual gates are accepted."
    ],
    evidence: [
      "The decision is recorded in docs/00-governance/open-questions.md or a release decision record.",
      "npm run package:check and npm run package:install-smoke pass.",
      "npm publish --dry-run --access public is reviewed if publishing is approved.",
      "No npm publish command has run unless the release owner explicitly approved it."
    ],
    commands: [
      "npm run package:check",
      "npm run package:install-smoke",
      "npm publish --dry-run --access public",
      "npm run release:plan:json"
    ],
    safety: "This plan command never runs npm publish, creates tags, or changes package ownership."
  },
  {
    id: "provider-live-credentials",
    title: "Provider-live credentials and cost approval",
    status: "manual",
    owner: "Secret owner and cost approver",
    why: "Real model calls can spend money and may send user-provided prompts to external providers.",
    actions: [
      "Create the Bitwarden Secrets Manager projects and machine accounts.",
      "Set only BW_ACCESS_TOKEN as the GitHub Environment bootstrap secret.",
      "Set Bitwarden secret ID variables for provider-live.",
      "Run strict BWS acceptance before live provider dispatch.",
      "Approve provider choice, outbound prompt content, and cost boundary before live verification."
    ],
    evidence: [
      "npm run bws:acceptance:strict passes.",
      "npm run providers:github:remote-check passes when GitHub credentials are available.",
      "Provider live report is generated as a sanitized runtime/tmp/provider-live-report.json or GitHub artifact.",
      "No real API key value appears in Git, docs, issues, PRs, logs, or chat."
    ],
    commands: [
      "npm run bws:plan",
      "npm run bws:acceptance:strict",
      "npm run providers:github:dispatch-plan",
      "npm run providers:live:safe-report:strict"
    ],
    safety: "Real provider verification remains opt-in and requires explicit cost acknowledgement."
  }
];

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    ok: true,
    manualOpen: gates.length,
    counts: {
      manual: gates.length
    }
  },
  safety: [
    "Does not read API keys, tokens, .env files, GitHub secrets, Bitwarden values, or provider responses.",
    "Does not modify GitHub settings, create tags, publish npm packages, or dispatch live providers.",
    "Intended as a handoff plan for the release owner, repository maintainer, and secret owner."
  ],
  gates
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

function renderMarkdown(manualGateReport) {
  const lines = [];
  lines.push("# AI Link Release Manual Gates");
  lines.push("");
  lines.push(`Generated: ${manualGateReport.generatedAt}`);
  lines.push("");
  lines.push("This report is safe for public logs. It does not read or print secret values.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- OK: ${manualGateReport.summary.ok ? "yes" : "no"}`);
  lines.push(`- Manual open: ${manualGateReport.summary.manualOpen}`);
  lines.push("");
  lines.push("## Gates");
  lines.push("");
  lines.push("| Gate | Owner | Status |");
  lines.push("| --- | --- | --- |");
  for (const gate of manualGateReport.gates) {
    lines.push(`| ${escapeCell(gate.title)} | ${escapeCell(gate.owner)} | ${escapeCell(gate.status)} |`);
  }
  lines.push("");

  for (const gate of manualGateReport.gates) {
    lines.push(`## ${gate.title}`);
    lines.push("");
    lines.push(`Owner: ${gate.owner}`);
    lines.push("");
    lines.push(`Why: ${gate.why}`);
    lines.push("");
    pushList(lines, "Actions", gate.actions);
    pushList(lines, "Evidence", gate.evidence);
    lines.push("Commands:");
    lines.push("");
    pushCommandBlock(lines, gate.commands);
    lines.push("");
    lines.push(`Safety: ${gate.safety}`);
    lines.push("");
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
