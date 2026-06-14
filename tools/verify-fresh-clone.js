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
  ["npm", ["run", "check"], clonePath],
  ["npm", ["test"], clonePath],
  ["npm", ["run", "ai-link", "--", "config", "validate"], clonePath],
  ["npm", ["run", "providers:dry"], clonePath],
  ["npm", ["run", "providers:github:check"], clonePath],
  ["npm", ["run", "bws:plan"], clonePath],
  ["npm", ["run", "bws:onboard:print"], clonePath],
  ["npm", ["run", "bws:check"], clonePath],
  ["npm", ["run", "bws:session:help"], clonePath],
  ["npm", ["run", "bws:worksheet"], clonePath],
  ["npm", ["run", "bws:github-vars:help"], clonePath],
  ["npm", ["run", "bws:acceptance:print"], clonePath],
  ["npm", ["run", "workflow:dry"], clonePath],
  ["npm", ["run", "ai-link", "--", "workflow", "run", "auto_ops", "--dry-run", "--input", "fresh clone output check", "--output", "runtime/tmp/auto-ops-workflow.json"], clonePath],
  ["npm", ["run", "ai-link", "--", "workflow", "run", "auto_ops", "--dry-run", "--input", "fresh clone record check", "--record"], clonePath],
  ["npm", ["run", "ai-link", "--", "runs", "list", "--json"], clonePath],
  ["npm", ["run", "ai-link", "--", "workflow", "run", "auto_ops", "--dry-run", "--stages", "research", "--input", "fresh clone resume seed", "--record"], clonePath],
  ["npm", ["run", "ai-link", "--", "workflow", "run", "auto_ops", "--dry-run", "--resume-from", "latest", "--input", "fresh clone resume continuation"], clonePath],
  ["npm", ["run", "ai-link", "--", "skill", "draft", "--skill", "auto_ops", "--description", "research with Grok, article draft with Kimi, Coze handles workflow, Codex handles implementation"], clonePath],
  ["npm", ["run", "ai-link", "--", "skill", "draft", "--skill", "auto_ops", "--description", "research with Grok, article draft with Kimi", "--write", ".ai-link/local.yaml"], clonePath],
  ["npm", ["run", "ai-link", "--", "run", "auto_ops.agent_flow", "--dry-run", "--input", "fresh clone agent check"], clonePath],
  ["npm", ["run", "ai-link", "--", "run", "auto_ops.research", "--dry-run", "--input", "fresh clone check"], clonePath],
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
