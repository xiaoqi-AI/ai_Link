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
  for (const file of [
    "googleOAuthDesktop.js",
    "googleSearchConsole.js",
    "googleSearchConsoleApi.js",
    "gscAuthorize.js",
    "gscCheck.js",
    "gscHistory.js",
    "platformAuthContracts.js"
  ]) {
    copyFileSync(path.join(cwd, "src", "connectors", file), path.join(connectorDist, file));
  }

  const authHubDist = path.join(distPath, "authHub");
  mkdirSync(authHubDist, { recursive: true });
  for (const file of ["projectTask.js", "projectTaskClient.js"]) {
    copyFileSync(path.join(cwd, "src", "authHub", file), path.join(authHubDist, file));
  }

  const securityDist = path.join(distPath, "security");
  mkdirSync(securityDist, { recursive: true });
  copyFileSync(
    path.join(cwd, "src", "security", "authHubOutbound.js"),
    path.join(securityDist, "authHubOutbound.js")
  );
}

process.exit(result.status ?? 1);
