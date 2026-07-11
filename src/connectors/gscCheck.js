#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  GoogleSearchConsoleConnector,
  MockGoogleSearchConsoleApiClient
} from "./googleSearchConsole.js";
import { createReadOnlyGoogleSearchConsoleApiClient } from "./googleSearchConsoleApi.js";
import { loadAuthorizedUserCredentials } from "./googleOAuthDesktop.js";
import {
  appendGscHistory,
  compareGscSnapshots,
  createGscSnapshot,
  latestGscSnapshot,
  loadGscHistory,
  saveGscHistory
} from "./gscHistory.js";

const DEFAULT_LIVE_HISTORY = "runtime/private/google-search-console/history.json";

function parseArgs(argv) {
  const result = {
    config: "",
    credentials: "",
    history: "",
    historyLimit: 90,
    noHistory: false,
    output: "",
    reportOutput: "",
    json: false,
    strict: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") result.json = true;
    else if (value === "--strict") result.strict = true;
    else if (value === "--config") result.config = argv[++index] || "";
    else if (value === "--credentials") result.credentials = argv[++index] || "";
    else if (value === "--history") result.history = argv[++index] || "";
    else if (value === "--history-limit") result.historyLimit = Number(argv[++index] || 0);
    else if (value === "--no-history") result.noHistory = true;
    else if (value === "--output") result.output = argv[++index] || "";
    else if (value === "--report-output") result.reportOutput = argv[++index] || "";
    else if (["--help", "-h"].includes(value)) result.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return result;
}

function printHelp() {
  console.log(`AI Link Google Search Console public check

Usage:
  npm run gsc:check -- --config <config.json> [--json]
    [--credentials runtime/private/google-search-console/authorized-user.json]
    [--history runtime/private/google-search-console/history.json]
    [--history-limit 90]
    [--no-history]
    [--output runtime/tmp/gsc-check.json]
    [--report-output runtime/tmp/gsc-report.md]
    [--strict]

Safety:
  - Performs same-origin HTTPS read-only checks for public pages, robots.txt, and sitemaps.
  - Uses mock Search Console API data unless --credentials selects a local authorized-user file.
  - Credential files inside this repository must stay under runtime/private/.
  - Live mode requests only read operations from Sites, URL Inspection, and Sitemaps.
  - Live mode keeps up to 90 redacted snapshots under runtime/private/ unless --no-history is used.
  - History contains URL status summaries only, never OAuth credentials or raw Google responses.
  - Never performs Request indexing or a live sitemap submission.
`);
}

async function writeOutput(filePath, content) {
  if (!filePath) return;
  const target = path.resolve(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.config) {
    printHelp();
    throw new Error("--config is required.");
  }
  if (args.noHistory && args.history) {
    throw new Error("--history and --no-history cannot be used together.");
  }

  const config = JSON.parse(await readFile(path.resolve(args.config), "utf8"));
  const apiClient = args.credentials
    ? createReadOnlyGoogleSearchConsoleApiClient({
        credentials: await loadAuthorizedUserCredentials(args.credentials)
      })
    : new MockGoogleSearchConsoleApiClient(config.mockGoogle || {});
  const connector = new GoogleSearchConsoleConnector({ apiClient });
  const historyPath = args.noHistory ? "" : (args.history || (args.credentials ? DEFAULT_LIVE_HISTORY : ""));
  const history = historyPath ? await loadGscHistory(historyPath) : null;
  const initialResult = await connector.monitorSite(config);
  const snapshot = createGscSnapshot(initialResult);
  const changes = history ? compareGscSnapshots(latestGscSnapshot(history), snapshot) : undefined;
  const updatedHistory = history
    ? appendGscHistory(history, snapshot, { limit: args.historyLimit })
    : null;
  const result = {
    ...initialResult,
    changes,
    history: {
      enabled: Boolean(updatedHistory),
      snapshotCount: updatedHistory?.entries.length || 0,
      retentionLimit: updatedHistory ? args.historyLimit : 0
    }
  };
  result.reportMarkdown = connector.generateStatusReport(result);
  const json = `${JSON.stringify(result, null, 2)}\n`;

  await Promise.all([
    writeOutput(args.output, json),
    writeOutput(args.reportOutput, result.reportMarkdown),
    updatedHistory ? saveGscHistory(historyPath, updatedHistory) : Promise.resolve()
  ]);
  console.log(args.json ? json.trimEnd() : result.reportMarkdown.trimEnd());
  if (args.strict && result.summary.requiresManualAction) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`gsc-check: ${error.message}`);
  process.exitCode = 1;
});
