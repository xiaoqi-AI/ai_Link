#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  GoogleSearchConsoleConnector,
  MockGoogleSearchConsoleApiClient
} from "./googleSearchConsole.js";
import { createReadOnlyGoogleSearchConsoleApiClient } from "./googleSearchConsoleApi.js";
import { loadAuthorizedUserCredentials } from "./googleOAuthDesktop.js";

function parseArgs(argv) {
  const result = { config: "", credentials: "", output: "", reportOutput: "", json: false, strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") result.json = true;
    else if (value === "--strict") result.strict = true;
    else if (value === "--config") result.config = argv[++index] || "";
    else if (value === "--credentials") result.credentials = argv[++index] || "";
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
    [--output runtime/tmp/gsc-check.json]
    [--report-output runtime/tmp/gsc-report.md]
    [--strict]

Safety:
  - Performs same-origin HTTPS read-only checks for public pages, robots.txt, and sitemaps.
  - Uses mock Search Console API data unless --credentials selects a local authorized-user file.
  - Credential files inside this repository must stay under runtime/private/.
  - Live mode requests only read operations from Sites, URL Inspection, and Sitemaps.
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

  const config = JSON.parse(await readFile(path.resolve(args.config), "utf8"));
  const apiClient = args.credentials
    ? createReadOnlyGoogleSearchConsoleApiClient({
        credentials: await loadAuthorizedUserCredentials(args.credentials)
      })
    : new MockGoogleSearchConsoleApiClient(config.mockGoogle || {});
  const connector = new GoogleSearchConsoleConnector({ apiClient });
  const result = await connector.monitorSite(config);
  const json = `${JSON.stringify(result, null, 2)}\n`;

  await Promise.all([
    writeOutput(args.output, json),
    writeOutput(args.reportOutput, result.reportMarkdown)
  ]);
  console.log(args.json ? json.trimEnd() : result.reportMarkdown.trimEnd());
  if (args.strict && result.summary.requiresManualAction) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`gsc-check: ${error.message}`);
  process.exitCode = 1;
});
