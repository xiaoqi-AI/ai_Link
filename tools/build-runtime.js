#!/usr/bin/env node
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
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

if (result.status === 0) {
  const connectorDist = path.join(distPath, "connectors");
  mkdirSync(connectorDist, { recursive: true });
  for (const file of ["googleSearchConsole.js", "gscCheck.js"]) {
    copyFileSync(path.join(cwd, "src", "connectors", file), path.join(connectorDist, file));
  }
}

process.exit(result.status ?? 1);
