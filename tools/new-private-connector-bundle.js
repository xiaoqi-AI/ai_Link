#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  realpathSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

const DEFAULT_MODULES = Object.freeze([
  "github-auth-adapter.mjs",
  "wechat-official-health-adapter.mjs",
  "xiaohongshu-readonly-adapter.mjs"
]);
const MODULE_EXTENSIONS = new Set([".js", ".mjs"]);
const args = process.argv.slice(2);
const outputJson = args.includes("--json");
const force = args.includes("--force");
const print = args.includes("--print");
const workspaceRoot = process.cwd();
const privateRoot = path.resolve(workspaceRoot, "runtime", "private");
const outputPath = valueAfter("--output") || "runtime/private/platform-connectors.mjs";
const resolvedOutput = path.resolve(workspaceRoot, outputPath);
const configuredModules = valuesAfter("--module");
const moduleInputs = configuredModules.length > 0 ? configuredModules : DEFAULT_MODULES;
const resolvedModules = moduleInputs.map(resolveModulePath);

const report = buildReport();

if (!print && report.summary.ok) {
  try {
    mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    writeFileSync(resolvedOutput, bundleTemplate(), {
      encoding: "utf8",
      flag: force ? "w" : "wx"
    });
    report.summary.written = true;
  } catch {
    addBlocker(report, "Bundle could not be written safely.");
  }
}

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

function buildReport() {
  const blockers = [];

  if (!isInside(privateRoot, resolvedOutput) || !hasSafeOutputLocation(resolvedOutput)) {
    blockers.push("Output path must stay under runtime/private.");
  }
  if (!MODULE_EXTENSIONS.has(path.extname(resolvedOutput).toLowerCase())) {
    blockers.push("Output file extension must be .mjs or .js.");
  }
  if (existsSync(resolvedOutput) && !isFile(resolvedOutput)) {
    blockers.push("Output path must reference a file.");
  }
  if (!force && existsSync(resolvedOutput) && !print) {
    blockers.push("Output file already exists. Rerun with --force only after reviewing the existing private file.");
  }

  for (const modulePath of resolvedModules) {
    if (!isInside(privateRoot, modulePath) || !hasSafeExistingLocation(modulePath)) {
      blockers.push("Module paths must stay under runtime/private.");
      continue;
    }
    if (!MODULE_EXTENSIONS.has(path.extname(modulePath).toLowerCase())) {
      blockers.push("Module file extension must be .mjs or .js.");
    }
    if (!existsSync(modulePath)) {
      blockers.push("Module file does not exist.");
      continue;
    }
    if (!isFile(modulePath)) {
      blockers.push("Module path must reference a file.");
    }
  }

  const moduleKeys = resolvedModules.map(canonicalPathKey);
  if (new Set(moduleKeys).size !== moduleKeys.length) {
    blockers.push("Duplicate module paths are not allowed.");
  }
  if (moduleKeys.includes(canonicalPathKey(resolvedOutput))) {
    blockers.push("Output file must not also be an input module.");
  }

  const uniqueBlockers = [...new Set(blockers)];
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      ok: uniqueBlockers.length === 0,
      written: false,
      printOnly: print,
      output: safePrivatePath(resolvedOutput),
      moduleCount: resolvedModules.length,
      blockingCount: uniqueBlockers.length,
      recommendedNext: uniqueBlockers.length
        ? "Resolve the listed blockers, then rerun this generator."
        : "Point AI_LINK_PRIVATE_CONNECTOR_MODULE to the generated bundle, then start the local Auth Hub executor."
    },
    output: {
      path: safePrivatePath(resolvedOutput),
      privateRoot: "runtime/private"
    },
    modules: resolvedModules.map(safePrivatePath),
    blockers: uniqueBlockers,
    commands: [
      `$env:AI_LINK_PRIVATE_CONNECTOR_MODULE="${safePrivatePath(resolvedOutput)}"`,
      "npm run auth-hub:executor:start"
    ],
    safety: [
      "The bundle and every input module must stay under runtime/private and must not be committed.",
      "The generator validates module files without importing them and never reads or prints credential values.",
      "The generated bundle rejects missing factories, invalid connector maps, and duplicate platform exports with path-free errors."
    ]
  };
}

function bundleTemplate() {
  const outputDirectory = path.dirname(resolvedOutput);
  const moduleSpecifiers = resolvedModules.map((modulePath) =>
    versionedModuleSpecifier(outputDirectory, modulePath)
  );

  return `const PRIVATE_MODULES = Object.freeze(${JSON.stringify(moduleSpecifiers, null, 2)});

export async function createPrivateConnectors() {
  const combined = {};

  for (const moduleSpecifier of PRIVATE_MODULES) {
    const privateModule = await loadPrivateModule(moduleSpecifier);
    if (typeof privateModule?.createPrivateConnectors !== "function") {
      throw bundleError("private_connector_factory_missing");
    }

    let exportedConnectors;
    try {
      exportedConnectors = await privateModule.createPrivateConnectors();
    } catch {
      throw bundleError("private_connector_factory_failed");
    }
    if (!isConnectorMap(exportedConnectors)) {
      throw bundleError("invalid_private_connector_export");
    }

    let entries;
    try {
      entries = Object.entries(exportedConnectors);
    } catch {
      throw bundleError("invalid_private_connector_export");
    }
    for (const [platform, connector] of entries) {
      if (Object.hasOwn(combined, platform)) {
        throw bundleError("duplicate_private_connector_platform");
      }
      Object.defineProperty(combined, platform, {
        value: connector,
        configurable: true,
        enumerable: true,
        writable: true
      });
    }
  }

  return combined;
}

async function loadPrivateModule(moduleSpecifier) {
  try {
    return await import(new URL(moduleSpecifier, import.meta.url));
  } catch {
    throw bundleError("private_connector_module_unavailable");
  }
}

function isConnectorMap(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function bundleError(reason) {
  const error = new Error("Private connector bundle could not be loaded safely.");
  error.code = "connector_contract_failed";
  error.reason = reason;
  error.retryable = false;
  error.stack = error.name + ": " + error.message;
  return error;
}
`;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Private Connector Bundle Scaffold");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push(`- Output: ${report.output.path}`);
  lines.push(`- Modules: ${report.summary.moduleCount}`);
  lines.push(`- Print only: ${report.summary.printOnly ? "yes" : "no"}`);
  lines.push(`- Written: ${report.summary.written ? "yes" : "no"}`);
  lines.push(`- Blocking count: ${report.summary.blockingCount}`);
  lines.push(`- Recommended next: ${report.summary.recommendedNext}`);
  lines.push("");
  lines.push("## Modules");
  lines.push("");
  for (const modulePath of report.modules) lines.push(`- ${modulePath}`);
  lines.push("");
  if (report.blockers.length) {
    lines.push("## Blockers");
    lines.push("");
    for (const blocker of report.blockers) lines.push(`- ${blocker}`);
    lines.push("");
  }
  lines.push("## Commands");
  lines.push("");
  lines.push("```powershell");
  lines.push(...report.commands);
  lines.push("```");
  lines.push("");
  lines.push("## Safety");
  lines.push("");
  for (const item of report.safety) lines.push(`- ${item}`);
  return `${lines.join("\n")}\n`;
}

function resolveModulePath(input) {
  const value = String(input || "");
  if (path.isAbsolute(value)) return path.resolve(value);

  const workspaceRelative = path.resolve(workspaceRoot, value);
  if (isInsideOrEqual(privateRoot, workspaceRelative)) return workspaceRelative;
  return path.resolve(privateRoot, value);
}

function relativeModuleSpecifier(fromDirectory, modulePath) {
  const relative = path.relative(fromDirectory, modulePath);
  const encoded = relative
    .split(path.sep)
    .map((segment) => segment === "." || segment === ".." ? segment : encodeURIComponent(segment))
    .join("/");
  return encoded.startsWith(".") ? encoded : `./${encoded}`;
}

function versionedModuleSpecifier(fromDirectory, modulePath) {
  const specifier = relativeModuleSpecifier(fromDirectory, modulePath);
  const modifiedAt = Math.floor(statSync(modulePath).mtimeMs);
  return `${specifier}?mtime=${modifiedAt}`;
}

function safePrivatePath(candidate) {
  if (!isInsideOrEqual(privateRoot, candidate)) return "(outside runtime/private)";
  const relative = path.relative(workspaceRoot, candidate).replaceAll("\\", "/");
  if (!relative || path.isAbsolute(relative) || relative.startsWith("../")) {
    return "(outside runtime/private)";
  }
  return relative;
}

function hasSafeExistingLocation(candidate) {
  if (!existsSync(candidate) || !existsSync(privateRoot)) return true;
  try {
    return isInside(realpathSync(privateRoot), realpathSync(candidate));
  } catch {
    return false;
  }
}

function hasSafeOutputLocation(candidate) {
  if (!existsSync(privateRoot)) return true;
  try {
    const realPrivateRoot = realpathSync(privateRoot);
    const anchor = nearestExistingPath(candidate);
    if (!anchor) return false;
    return isInsideOrEqual(realPrivateRoot, realpathSync(anchor));
  } catch {
    return false;
  }
}

function nearestExistingPath(candidate) {
  let current = candidate;
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return "";
    current = parent;
  }
  return current;
}

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function canonicalPathKey(candidate) {
  let canonical = candidate;
  try {
    if (existsSync(candidate)) {
      const metadata = statSync(candidate);
      if (metadata.ino) return `file:${metadata.dev}:${metadata.ino}`;
      canonical = realpathSync(candidate);
    }
  } catch {
    canonical = candidate;
  }
  const normalized = path.normalize(canonical);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== ""
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function isInsideOrEqual(parent, candidate) {
  return canonicalPathKey(parent) === canonicalPathKey(candidate) || isInside(parent, candidate);
}

function addBlocker(targetReport, blocker) {
  if (!targetReport.blockers.includes(blocker)) targetReport.blockers.push(blocker);
  targetReport.summary.ok = false;
  targetReport.summary.blockingCount = targetReport.blockers.length;
  targetReport.summary.recommendedNext = "Resolve the listed blockers, then rerun this generator.";
}

function valueAfter(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : "";
}

function valuesAfter(name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    values.push(value && !value.startsWith("--") ? value : "");
  }
  return values;
}
