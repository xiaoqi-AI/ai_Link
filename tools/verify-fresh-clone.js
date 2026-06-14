#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-fresh-"));
const clonePath = path.join(tempRoot, "repo");

const commands = [
  ["git", ["clone", "--no-local", root, clonePath], root],
  ["npm", ["ci"], clonePath],
  ["npm", ["run", "onboard:print"], clonePath],
  ["npm", ["run", "onboard:json"], clonePath],
  ["npm", ["run", "onboard:check"], clonePath],
  ["npm", ["run", "check"], clonePath],
  ["npm", ["run", "skills:check"], clonePath],
  ["npm", ["test"], clonePath],
  ["npm", ["run", "package:check"], clonePath],
  ["npm", ["run", "package:check:json"], clonePath],
  ["npm", ["run", "package:install-smoke"], clonePath],
  ["npm", ["run", "package:install-smoke:json"], clonePath],
  ["npm", ["run", "next:actions"], clonePath],
  ["npm", ["run", "next:actions:json"], clonePath],
  ["npm", ["run", "setup:handoff"], clonePath],
  ["npm", ["run", "setup:handoff:json"], clonePath],
  ["npm", ["run", "bws:next"], clonePath],
  ["npm", ["run", "bws:next:json"], clonePath],
  ["npm", ["run", "github:safety"], clonePath],
  ["npm", ["run", "github:safety:json"], clonePath],
  ["npm", ["run", "github:hardening"], clonePath],
  ["npm", ["run", "github:hardening:json"], clonePath],
  ["npm", ["run", "github:hardening:next"], clonePath],
  ["npm", ["run", "github:hardening:next:json"], clonePath],
  ["npm", ["run", "release:plan"], clonePath],
  ["npm", ["run", "release:plan:json"], clonePath],
  ["npm", ["run", "release:decisions"], clonePath],
  ["npm", ["run", "release:decisions:json"], clonePath],
  ["npm", ["run", "release:decisions:next"], clonePath],
  ["npm", ["run", "release:decisions:next:json"], clonePath],
  ["npm", ["run", "release:decisions:update"], clonePath],
  ["npm", ["run", "release:manual-gates"], clonePath],
  ["npm", ["run", "release:manual-gates:json"], clonePath],
  ["npm", ["run", "release:evidence"], clonePath],
  ["npm", ["run", "release:evidence:json"], clonePath],
  ["npm", ["run", "release:readiness"], clonePath],
  ["npm", ["run", "release:readiness:json"], clonePath],
  ["npm", ["run", "ai-link", "--", "config", "validate"], clonePath],
  ["npm", ["run", "providers:dry"], clonePath],
  ["npm", ["run", "providers:dry:json"], clonePath],
  ["npm", ["run", "providers:github:check"], clonePath],
  ["npm", ["run", "bws:plan"], clonePath],
  ["npm", ["run", "bws:onboard:print"], clonePath],
  ["npm", ["run", "bws:profile:print"], clonePath],
  ["npm", ["run", "bws:activate:plan"], clonePath],
  ["npm", ["run", "bws:check"], clonePath],
  ["npm", ["run", "bws:session:help"], clonePath],
  ["npm", ["run", "bws:run:help"], clonePath],
  ["npm", ["run", "bws:worksheet"], clonePath],
  ["npm", ["run", "bws:rotation:print"], clonePath],
  ["npm", ["run", "bws:github-vars:help"], clonePath],
  ["npm", ["run", "bws:github-vars:apply-plan"], clonePath],
  ["npm", ["run", "bws:acceptance:print"], clonePath],
  ["npm", ["run", "providers:github:dispatch-plan"], clonePath],
  ["npm", ["run", "workflow:dry"], clonePath],
  ["npm", ["run", "ai-link", "--", "workflow", "run", "auto_ops", "--dry-run", "--input", "fresh clone output check", "--output", "runtime/tmp/auto-ops-workflow.json"], clonePath],
  ["npm", ["run", "ai-link", "--", "workflow", "run", "auto_ops", "--dry-run", "--input", "fresh clone record check", "--record"], clonePath],
  ["npm", ["run", "ai-link", "--", "runs", "list", "--json"], clonePath],
  ["npm", ["run", "ai-link", "--", "workflow", "run", "auto_ops", "--dry-run", "--stages", "research", "--input", "fresh clone resume seed", "--record"], clonePath],
  ["npm", ["run", "ai-link", "--", "workflow", "run", "auto_ops", "--dry-run", "--resume-from", "latest", "--input", "fresh clone resume continuation"], clonePath],
  ["npm", ["run", "ai-link", "--", "skill", "draft", "--skill", "auto_ops", "--description", "research with Grok, article draft with Kimi, Coze handles workflow, Codex handles implementation"], clonePath],
  ["npm", ["run", "ai-link", "--", "skill", "draft", "--skill", "auto_ops", "--description", "research with Grok, article draft with Kimi", "--write", ".ai-link/local.yaml", "--diff", "--json"], clonePath],
  ["npm", ["run", "ai-link", "--", "run", "auto_ops.agent_flow", "--dry-run", "--input", "fresh clone agent check"], clonePath],
  ["npm", ["run", "ai-link", "--", "run", "auto_ops.research", "--dry-run", "--input", "fresh clone check"], clonePath],
  ["npm", ["run", "auth-hub:audit-smoke"], clonePath],
  ["npm", ["run", "auth-hub:deploy:check"], clonePath],
  ["npm", ["run", "security:scan"], clonePath]
];

try {
  for (const [command, args, cwd] of commands) {
    run(command, args, cwd);
  }
  console.log(`Fresh clone verification passed: ${clonePath}`);
} finally {
  if (process.env.AI_LINK_KEEP_FRESH_CLONE !== "1") {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function run(command, args, cwd) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const resolved = resolveCommand(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    cwd,
    stdio: "inherit"
  });
  if (result.error) {
    console.error(result.error.message);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveCommand(command, args) {
  if (process.platform !== "win32") {
    return { command, args };
  }

  if (command === "npm") {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", "npm", ...args] };
  }

  if (command === "git") {
    return { command: "git.exe", args };
  }

  return { command, args };
}
