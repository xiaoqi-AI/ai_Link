#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");
const cwd = process.cwd();
const checks = [];

function addCheck(name, status, detail, category = "package") {
  checks.push({ name, status, detail, category });
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function runNpm(commandArgs, runCwd) {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const resolvedArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm", ...commandArgs]
    : commandArgs;

  return spawnSync(command, resolvedArgs, {
    cwd: runCwd,
    encoding: "utf8"
  });
}

function runNode(commandArgs, runCwd) {
  return spawnSync(process.execPath, commandArgs, {
    cwd: runCwd,
    encoding: "utf8"
  });
}

function parsePackJson(stdout) {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("npm pack did not return JSON output");
  }
  return JSON.parse(stdout.slice(start, end + 1));
}

function cleanFailure(result) {
  if (result.error) {
    return result.error.message;
  }
  return (result.stderr || result.stdout || "failed").trim().replace(/\r?\n/g, " ");
}

const packageJsonPath = path.resolve(cwd, "package.json");
const packageJson = readJson(packageJsonPath);
const tempRoot = mkdtempSync(path.join(tmpdir(), "ai-link-package-install-"));
const packDir = path.join(tempRoot, "pack");
const consumerDir = path.join(tempRoot, "consumer");
const npmCacheDir = path.join(tempRoot, "npm-cache");
let tarballPath;

try {
  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });
  mkdirSync(npmCacheDir, { recursive: true });

  if (!packageJson) {
    addCheck("package.json", "fail", "missing or invalid", "package");
  } else {
    addCheck("package name", packageJson.name === "@xiaoqi-ai/ai-link" ? "pass" : "fail", packageJson.name ?? "missing", "package");
    addCheck("package version", /^\d+\.\d+\.\d+/.test(packageJson.version ?? "") ? "pass" : "fail", packageJson.version ?? "missing", "package");
  }

  addCheck("dist cli", existsSync(path.resolve(cwd, "dist", "cli.js")) ? "pass" : "fail", "dist/cli.js", "files");
  addCheck("dist gsc cli", existsSync(path.resolve(cwd, "dist", "connectors", "gscCheck.js")) ? "pass" : "fail", "dist/connectors/gscCheck.js", "files");

  const packResult = runNpm(["pack", "--json", "--pack-destination", packDir], cwd);
  let packMetadata;
  if (packResult.error || packResult.status !== 0) {
    addCheck("npm pack", "fail", cleanFailure(packResult), "package");
  } else {
    try {
      packMetadata = parsePackJson(packResult.stdout)[0];
      tarballPath = path.resolve(packDir, packMetadata.filename);
      addCheck("npm pack", existsSync(tarballPath) ? "pass" : "fail", packMetadata.filename ?? "missing", "package");
    } catch (error) {
      addCheck("npm pack", "fail", error instanceof Error ? error.message : String(error), "package");
    }
  }

  writeFileSync(path.join(consumerDir, "package.json"), `${JSON.stringify({
    private: true,
    type: "module"
  }, null, 2)}\n`, "utf8");

  if (tarballPath && existsSync(tarballPath)) {
    const installResult = runNpm(["install", tarballPath, "--ignore-scripts", "--no-audit", "--no-fund", "--cache", npmCacheDir], consumerDir);
    addCheck("npm install tarball", installResult.status === 0 ? "pass" : "fail", installResult.status === 0 ? "installed" : cleanFailure(installResult), "install");
  } else {
    addCheck("npm install tarball", "fail", "tarball unavailable", "install");
  }

  const installedPackagePath = path.join(consumerDir, "node_modules", "@xiaoqi-ai", "ai-link", "package.json");
  const installedPackage = readJson(installedPackagePath);
  addCheck("installed package", installedPackage?.name === "@xiaoqi-ai/ai-link" ? "pass" : "fail", installedPackage?.name ?? "missing", "install");
  addCheck("installed version", installedPackage?.version === packageJson?.version ? "pass" : "fail", installedPackage?.version ?? "missing", "install");

  const installedCli = path.join(consumerDir, "node_modules", "@xiaoqi-ai", "ai-link", "dist", "cli.js");
  const installedGscCli = path.join(consumerDir, "node_modules", "@xiaoqi-ai", "ai-link", "dist", "connectors", "gscCheck.js");
  addCheck("installed cli", existsSync(installedCli) ? "pass" : "fail", "node_modules/@xiaoqi-ai/ai-link/dist/cli.js", "install");
  addCheck("installed gsc cli", existsSync(installedGscCli) ? "pass" : "fail", "node_modules/@xiaoqi-ai/ai-link/dist/connectors/gscCheck.js", "install");

  if (existsSync(installedCli)) {
    const versionResult = runNode([installedCli, "--version"], consumerDir);
    addCheck(
      "installed cli version",
      versionResult.status === 0 && versionResult.stdout.trim() === packageJson?.version ? "pass" : "fail",
      versionResult.status === 0 ? versionResult.stdout.trim() : cleanFailure(versionResult),
      "cli"
    );

    const configResult = runNode([installedCli, "config", "validate"], consumerDir);
    addCheck(
      "installed cli config validate",
      configResult.status === 0 ? "pass" : "fail",
      configResult.status === 0 ? "valid" : cleanFailure(configResult),
      "cli"
    );
  } else {
    addCheck("installed cli version", "fail", "installed cli unavailable", "cli");
    addCheck("installed cli config validate", "fail", "installed cli unavailable", "cli");
  }

  if (existsSync(installedGscCli)) {
    const helpResult = runNode([installedGscCli, "--help"], consumerDir);
    addCheck(
      "installed gsc cli help",
      helpResult.status === 0 && helpResult.stdout.includes("Google Search Console public check") ? "pass" : "fail",
      helpResult.status === 0 ? "help rendered" : cleanFailure(helpResult),
      "cli"
    );
  } else {
    addCheck("installed gsc cli help", "fail", "installed gsc cli unavailable", "cli");
  }
} finally {
  if (process.env.AI_LINK_KEEP_PACKAGE_INSTALL_SMOKE !== "1") {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

const counts = { pass: 0, fail: 0 };
for (const check of checks) {
  counts[check.status] += 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    ok: counts.fail === 0,
    counts
  },
  package: {
    name: packageJson?.name,
    version: packageJson?.version,
    tarball: tarballPath ? path.basename(tarballPath) : undefined
  },
  checks
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("AI Link package install smoke");
  console.log(`OK: ${report.summary.ok ? "yes" : "no"}`);
  console.log(`Counts: pass ${counts.pass}, fail ${counts.fail}`);
  console.log(`Tarball: ${report.package.tarball ?? "unavailable"}`);
  console.log("");
  console.table(checks.map((check) => ({
    category: check.category,
    name: check.name,
    status: check.status,
    detail: check.detail
  })));
}

if (!report.summary.ok) {
  process.exitCode = 2;
}
