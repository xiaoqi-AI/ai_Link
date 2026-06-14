#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const outputJson = args.has("--json");
const cwd = process.cwd();
const checks = [];

function addCheck(name, status, detail, category = "package") {
  checks.push({ name, status, detail, category });
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(path.resolve(cwd, relativePath), "utf8"));
  } catch {
    return undefined;
  }
}

function runNpmPackDryRun() {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm", "pack", "--dry-run", "--json"]
    : ["pack", "--dry-run", "--json"];

  return spawnSync(command, commandArgs, {
    cwd,
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

function hasFile(files, filePath) {
  return files.includes(filePath);
}

function checkRequiredFiles(files) {
  for (const file of [
    "package.json",
    "README.md",
    "LICENSE",
    "dist/cli.js",
    "dist/index.js",
    "dist/types.d.ts",
    "docs/user-guide.md",
    "docs/20-architecture/configuration.md",
    "docs/20-architecture/provider-adapters.md",
    "docs/20-architecture/codex-skill-integration.md",
    "examples/auto-ops/README.md",
    "examples/codex-skills/auto-ops-ai-link/SKILL.md"
  ]) {
    addCheck(`required file ${file}`, hasFile(files, file) ? "pass" : "fail", file, "files");
  }
}

function checkAllowedPackageSurface(files) {
  const allowedRootFiles = new Set(["package.json", "README.md", "LICENSE"]);
  const allowedRootDirs = new Set(["dist", "docs", "examples"]);
  const unexpected = files.filter((file) => {
    if (allowedRootFiles.has(file)) {
      return false;
    }
    const root = file.split("/")[0];
    return !allowedRootDirs.has(root);
  });

  addCheck(
    "package surface allowlist",
    unexpected.length === 0 ? "pass" : "fail",
    unexpected.length === 0 ? "dist, docs, examples, README, LICENSE" : unexpected.join(", "),
    "security"
  );
}

function checkForbiddenFiles(files) {
  const forbiddenRules = [
    {
      name: "source tree excluded",
      matches: (file) => file.startsWith("src/") || file.startsWith("tests/") || file.startsWith("tools/")
    },
    {
      name: "repository automation excluded",
      matches: (file) => file.startsWith(".github/") || file.startsWith(".ai-link/")
    },
    {
      name: "runtime state excluded",
      matches: (file) => file.startsWith("runtime/") || file.startsWith("node_modules/")
    },
    {
      name: "compiled tests excluded",
      matches: (file) => /(^|\/).*\.test\.(js|d\.ts|js\.map)$/.test(file)
    },
    {
      name: "dotenv files excluded",
      matches: (file) => /(^|\/)\.env($|\.)/i.test(file)
    },
    {
      name: "private auth state excluded",
      matches: (file) => /(^|\/)(runtime\/private|.*auth-state.*|.*login-state.*|.*cookies.*)/i.test(file)
    }
  ];

  for (const rule of forbiddenRules) {
    const matches = files.filter((file) => rule.matches(file));
    addCheck(rule.name, matches.length === 0 ? "pass" : "fail", matches.length === 0 ? "none" : matches.join(", "), "security");
  }
}

const packageJson = readJson("package.json");
if (!packageJson) {
  addCheck("package.json", "fail", "missing or invalid", "package");
} else {
  addCheck("package name", packageJson.name === "@xiaoqi-ai/ai-link" ? "pass" : "fail", packageJson.name ?? "missing", "package");
  addCheck("package version", /^\d+\.\d+\.\d+/.test(packageJson.version ?? "") ? "pass" : "fail", packageJson.version ?? "missing", "package");
  addCheck("license", packageJson.license === "Apache-2.0" ? "pass" : "fail", packageJson.license ?? "missing", "package");
  addCheck("bin ai-link", packageJson.bin?.["ai-link"] === "dist/cli.js" ? "pass" : "fail", packageJson.bin?.["ai-link"] ?? "missing", "package");
  addCheck(
    "package files allowlist",
    JSON.stringify(packageJson.files ?? []) === JSON.stringify(["dist", "README.md", "LICENSE", "docs", "examples"]) ? "pass" : "fail",
    JSON.stringify(packageJson.files ?? []),
    "package"
  );
}

let packMetadata;
const packResult = runNpmPackDryRun();
if (packResult.error) {
  addCheck("npm pack dry-run", "fail", packResult.error.message, "package");
} else if (packResult.status !== 0) {
  addCheck("npm pack dry-run", "fail", (packResult.stderr || packResult.stdout || "failed").trim(), "package");
} else {
  try {
    const parsed = parsePackJson(packResult.stdout);
    packMetadata = parsed[0];
    addCheck("npm pack dry-run", "pass", packMetadata?.filename ?? "ok", "package");
  } catch (error) {
    addCheck("npm pack dry-run", "fail", error instanceof Error ? error.message : String(error), "package");
  }
}

const packedFiles = (packMetadata?.files ?? []).map((file) => file.path).sort();
if (packedFiles.length > 0) {
  checkRequiredFiles(packedFiles);
  checkAllowedPackageSurface(packedFiles);
  checkForbiddenFiles(packedFiles);
} else {
  addCheck("package file list", "fail", "empty or unavailable", "files");
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
    filename: packMetadata?.filename,
    entryCount: packedFiles.length,
    unpackedSize: packMetadata?.unpackedSize
  },
  checks
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("AI Link package contents");
  console.log(`OK: ${report.summary.ok ? "yes" : "no"}`);
  console.log(`Counts: pass ${counts.pass}, fail ${counts.fail}`);
  console.log(`Package: ${report.package.filename ?? "unavailable"}`);
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
