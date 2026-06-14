#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-fresh-"));
const clonePath = path.join(tempRoot, "repo");

const commands = [
  ["git", ["clone", "--local", root, clonePath], root],
  ["npm", ["ci"], clonePath],
  ["npm", ["run", "check"], clonePath],
  ["npm", ["test"], clonePath],
  ["npm", ["run", "ai-link", "--", "config", "validate"], clonePath],
  ["npm", ["run", "ai-link", "--", "run", "auto_ops.research", "--dry-run", "--input", "fresh clone check"], clonePath],
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
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
