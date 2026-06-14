#!/usr/bin/env node
import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const cwd = process.cwd();
const distPath = path.resolve(cwd, "dist");
const tscCli = path.resolve(cwd, "node_modules", "typescript", "bin", "tsc");

rmSync(distPath, { recursive: true, force: true });

const result = spawnSync(process.execPath, [tscCli, "-p", "tsconfig.build.json"], {
  cwd,
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
